"""Local operations-study API. Start with uvicorn api.app.main:app."""

import hashlib
import json
import threading
from pathlib import Path
from typing import Annotated

import duckdb
from fastapi import BackgroundTasks, FastAPI, HTTPException, Response
from fastapi import Query as Parameter
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from scm.config.api import load_api_settings
from scm.contracts import (
    ApiError,
    Comparison,
    ExperimentName,
    ExperimentResults,
    Health,
    Kpis,
    Metric,
    QueryRequest,
    QueryResults,
    RunNetwork,
    RunRequest,
    RunStatus,
    ScenarioCatalog,
    StudyEvidence,
    TimeSeries,
)

from api.app.query import filter_nodes, parse_filter
from api.app.service import RunStore


def create_app(
    *, run_root: Path = Path("data/runs"), experiment_root: Path = Path("docs/evidence/m7")
) -> FastAPI:
    settings = load_api_settings()
    app = FastAPI(
        title="OpenSCM operations study",
        version="0.1.0",
        separate_input_output_schemas=False,
        responses={code: {"model": ApiError} for code in (404, 409, 422, 503)},
    )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: object, exc: RequestValidationError) -> JSONResponse:
        error = ApiError(
            detail="Invalid request",
            issues=[
                f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}"
                for issue in exc.errors()
            ],
        )
        return JSONResponse(status_code=422, content=error.model_dump())

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    cache: RunStore | None = None
    cache_lock = threading.Lock()

    def store() -> RunStore:
        nonlocal cache
        with cache_lock:
            if cache is None:
                cache = RunStore(run_root, settings)
            return cache

    @app.get("/scenarios", response_model=ScenarioCatalog, operation_id="list_scenarios")
    def scenarios() -> ScenarioCatalog:
        return ScenarioCatalog(presets={"base_4dc": store().study.scenario})

    @app.get("/studies", response_model=StudyEvidence, operation_id="get_study_evidence")
    def study_evidence() -> StudyEvidence:
        path = Path("web/public/fixtures/studies.json")
        if not path.is_file():
            raise HTTPException(404, "Study evidence has not been exported")
        return StudyEvidence.model_validate_json(path.read_text(encoding="utf-8"))

    @app.post(
        "/runs",
        response_model=RunStatus,
        status_code=201,
        operation_id="create_run",
        responses={
            200: {"model": RunStatus, "description": "Cached completed run"},
            202: {"model": RunStatus, "description": "Queued or running replication job"},
        },
    )
    def create_run(request: RunRequest, response: Response, tasks: BackgroundTasks) -> RunStatus:
        repository = store()
        status, created = repository.reserve(request)
        if not created:
            response.status_code = 200 if status.status == "complete" else 202
            return status
        if request.replications == 1:
            repository.compute(status.run_id)
            status = repository.status(status.run_id)
            if status.status == "failed":
                raise HTTPException(500, status.error)
        else:
            response.status_code = 202
            tasks.add_task(repository.compute, status.run_id)
        return status

    @app.get("/runs/{run_id}", response_model=RunStatus, operation_id="get_run")
    def get_run(run_id: str) -> RunStatus:
        return store().status(run_id)

    @app.get("/runs/{run_id}/network", response_model=RunNetwork, operation_id="get_network")
    def network(run_id: str) -> RunNetwork:
        return store().network(run_id)

    @app.get("/runs/{run_id}/health", response_model=Health, operation_id="get_health")
    def health(run_id: str) -> Health:
        return Health.model_validate_json((store().ready(run_id) / "health.json").read_text())

    @app.get("/runs/{run_id}/kpis", response_model=Kpis, operation_id="get_kpis")
    def kpis(run_id: str, node: str | None = None) -> Kpis:
        return store().kpis(run_id, node)

    @app.get(
        "/runs/{run_id}/timeseries",
        response_model=TimeSeries,
        operation_id="get_timeseries",
    )
    def timeseries(
        run_id: str,
        node: str,
        sku: str,
        metrics: Annotated[list[Metric] | None, Parameter()] = None,
        start_day: Annotated[int | None, Parameter(ge=0)] = None,
        end_day: Annotated[int | None, Parameter(ge=0)] = None,
    ) -> TimeSeries:
        return store().timeseries(
            run_id,
            node,
            sku,
            metrics
            if metrics is not None
            else ["on_hand", "on_order", "backorders", "fill_rate", "days_of_cover"],
            start_day,
            end_day,
        )

    @app.post("/runs/{run_id}/query", response_model=QueryResults, operation_id="query_nodes")
    def query_nodes(run_id: str, request: QueryRequest) -> QueryResults:
        repository = store()
        folder = repository.ready(run_id)
        health_data = Health.model_validate_json((folder / "health.json").read_text())
        day = health_data.days[-1] if request.day is None else request.day
        if day not in health_data.days:
            raise HTTPException(422, "Query day is outside the simulation")
        try:
            query = (
                request.filter if request.filter is not None else parse_filter(request.text or "")
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return filter_nodes(folder / "nodes.parquet", run_id, day, query)

    @app.get("/compare", response_model=Comparison, operation_id="compare_runs")
    def compare(a: str, b: str) -> Comparison:
        return store().compare(a, b)

    @app.get(
        "/experiments/{experiment}", response_model=ExperimentResults, operation_id="get_experiment"
    )
    def experiment_results(
        experiment: ExperimentName,
        offset: Annotated[int, Parameter(ge=0)] = 0,
        limit: Annotated[int | None, Parameter(ge=1)] = None,
        case_id: Annotated[str | None, Parameter(pattern=r"^[A-Za-z0-9_-]+$")] = None,
        metric: Annotated[str | None, Parameter(pattern=r"^[A-Za-z0-9_-]+$")] = None,
    ) -> ExperimentResults:
        page_size = settings.experiment_page_size if limit is None else limit
        if page_size > settings.experiment_page_limit:
            raise HTTPException(422, "Experiment page exceeds the configured limit")
        folder = experiment_root / experiment
        path = folder / "results.parquet"
        if not path.is_file() or not (folder / "manifest.json").is_file():
            raise HTTPException(404, "Experiment evidence is unavailable")
        manifest = json.loads((folder / "manifest.json").read_text())
        if hashlib.sha256(path.read_bytes()).hexdigest() != manifest["parquet_sha256"]:
            raise HTTPException(409, "Experiment checksum does not match its manifest")
        clauses = []
        parameters: list[object] = [str(path)]
        for column, value in (("case_id", case_id), ("metric", metric)):
            if value is not None:
                clauses.append(f"{column}=?")
                parameters.append(value)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with duckdb.connect() as connection:
            count_row = connection.execute(
                "SELECT count(*) FROM read_parquet(?)" + where, parameters
            ).fetchone()
            assert count_row is not None
            total = int(count_row[0])
            result = connection.execute(
                "SELECT case_id,phase,replication,seed,metric,value FROM read_parquet(?)"
                + where
                + " ORDER BY phase,case_id,replication,metric LIMIT ? OFFSET ?",
                parameters + [page_size, offset],
            ).fetchall()
        columns = {
            name: [row[i] for row in result]
            for i, name in enumerate(("case_id", "phase", "replication", "seed", "metric", "value"))
        }
        return ExperimentResults.model_validate(
            dict(
                experiment=experiment,
                config_hash=manifest["config_hash"],
                total=total,
                offset=offset,
                **columns,
            )
        )

    return app


app = create_app()
