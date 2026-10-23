"""Local operations-study API. Start with uvicorn api.app.main:app."""

import hashlib
import json
import os
import threading
from pathlib import Path
from typing import Annotated

import duckdb
import yaml
from fastapi import BackgroundTasks, FastAPI, HTTPException, Response
from fastapi import Query as Parameter
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from scm.config.api import load_api_settings
from scm.contracts import (
    ApiError,
    BuilderCatalog,
    Comparison,
    ExperimentName,
    ExperimentResults,
    Health,
    Kpis,
    LabCatalog,
    LabSettings,
    LaneAssumptions,
    LaunchRequest,
    ModelPreview,
    ModelSnapshot,
    PortfolioDraft,
    PortfolioExecution,
    PortfolioUpdate,
    QueryRequest,
    QueryResults,
    RunDiagnostics,
    RunNetwork,
    RunProvenance,
    RunRequest,
    RunStatus,
    SavedScenario,
    ScenarioCatalog,
    ScenarioOverrides,
    SeriesMetric,
    StudyEvidence,
    TimeSeries,
)
from scm.network.builder import build_network

from api.app.cases import case_router
from api.app.portfolio import PortfolioStore
from api.app.query import filter_nodes, parse_filter
from api.app.service import RunStore


def create_app(
    *, run_root: Path | None = None, experiment_root: Path = Path("docs/evidence/m7")
) -> FastAPI:
    run_root = run_root or Path(os.environ.get("SCM_RUN_ROOT", "data/runs"))
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
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )
    cache: RunStore | None = None
    cache_lock = threading.Lock()
    portfolios = PortfolioStore(run_root.parent / "portfolio.sqlite3")

    def store() -> RunStore:
        nonlocal cache
        with cache_lock:
            if cache is None:
                cache = RunStore(run_root, settings)
            return cache

    @app.get("/scenarios", response_model=ScenarioCatalog, operation_id="list_scenarios")
    def scenarios() -> ScenarioCatalog:
        return ScenarioCatalog(presets={"base_4dc": store().study.scenario})

    @app.get("/models/catalog", response_model=BuilderCatalog, operation_id="get_builder_catalog")
    def builder_catalog() -> BuilderCatalog:
        source = store()
        defaults = yaml.safe_load(Path("configs/lab.yaml").read_text(encoding="utf-8"))
        limits = yaml.safe_load(Path("configs/builder.yaml").read_text(encoding="utf-8"))
        return BuilderCatalog(
            request=RunRequest(
                seed=defaults["seed"],
                replications=defaults["replications"],
                overrides=ScenarioOverrides(
                    warmup_days=defaults["warmup_days"], horizon_days=defaults["horizon_days"]
                ),
                model=ModelSnapshot(spec=source.study.spec, seasonality=source.study.seasonality),
            ),
            max_observation_cells=limits["max_observation_cells"],
        )

    @app.post("/models/preview", response_model=ModelPreview, operation_id="preview_model")
    def preview_model(request: RunRequest) -> ModelPreview:
        scenario, effective = store().resolve(request)
        net = build_network(effective.spec, scenario)
        active = set(
            zip(net.as_contract("preview").edges.source, net.as_contract("preview").edges.target)
        )
        warnings = [
            f"Override {lane.source} → {lane.target} is inactive in this topology."
            for lane in effective.spec.lanes
            if (lane.source, lane.target) not in active
        ]
        if any(site.daily_capacity == 0 for site in effective.spec.suppliers) or any(
            dc.daily_capacity == 0 for dc in effective.spec.dcs
        ):
            warnings.append("A facility has zero dispatch capacity; service may be constrained.")
        return ModelPreview(
            network=net.as_contract("preview"),
            sku_ids=[sku.id for sku in effective.spec.skus],
            open_dcs=[net.node_ids[i] for i in net.is_dc.nonzero()[0]],
            assignments={
                net.node_ids[i]: net.node_ids[net.parent[0, i]] for i in net.customer_indices
            },
            lanes=[
                LaneAssumptions(
                    source=net.node_ids[a],
                    target=net.node_ids[b],
                    distance_km=float(net.distance[i]),
                    lead_mean=float(net.lead_mean[i]),
                    lead_cv=float(net.lead_cv[i]),
                    delay_probability=float(net.delay_probability[i]),
                    delay_days=int(net.delay_days[i]),
                )
                for i, (a, b) in enumerate(zip(net.source, net.target))
            ],
            warnings=warnings,
        )

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

    @app.get("/lab", response_model=LabCatalog, operation_id="get_lab_catalog")
    def lab_catalog() -> LabCatalog:
        source = store()
        defaults = yaml.safe_load(Path("configs/lab.yaml").read_text(encoding="utf-8"))
        return LabCatalog.model_validate(
            {
                "request": {
                    "seed": defaults["seed"],
                    "replications": defaults["replications"],
                    "overrides": {
                        "warmup_days": defaults["warmup_days"],
                        "horizon_days": defaults["horizon_days"],
                    },
                },
                "suppliers": [
                    {
                        "id": row.id,
                        "label": row.label,
                        **row.model_dump(exclude={"id", "label", "latitude", "longitude"}),
                    }
                    for row in source.study.spec.suppliers
                ],
                "sku_ids": [row.id for row in source.study.spec.skus],
                "monthly_index": source.study.seasonality.monthly_index_v1,
                "seasonal_example": defaults["seasonal_example"],
                "forecast": LabSettings(
                    forecast_method=source.planning.forecast.method,
                    forecast_window=source.planning.forecast.window,
                    forecast_alpha=source.planning.forecast.alpha,
                    forecast_beta=source.planning.forecast.beta,
                ).model_dump(),
                "max_replications": settings.max_replications,
                "max_horizon_days": settings.max_horizon_days,
                "max_warmup_days": settings.max_warmup_days,
            }
        )

    @app.get("/portfolio", response_model=list[SavedScenario], operation_id="list_portfolio")
    def list_portfolio() -> list[SavedScenario]:
        return portfolios.list_scenarios()

    @app.get(
        "/portfolio/{scenario_id}/revisions",
        response_model=list[SavedScenario],
        operation_id="scenario_revisions",
    )
    def scenario_revisions(scenario_id: str) -> list[SavedScenario]:
        return portfolios.revisions(scenario_id)

    @app.post("/lab/validate", response_model=RunRequest, operation_id="validate_lab_request")
    def validate_lab_request(request: RunRequest) -> RunRequest:
        store().resolve(request)
        return request

    @app.post(
        "/portfolio", response_model=SavedScenario, status_code=201, operation_id="save_scenario"
    )
    def save_scenario(draft: PortfolioDraft) -> SavedScenario:
        store().resolve(draft.request)
        return portfolios.create(draft)

    @app.put(
        "/portfolio/{scenario_id}", response_model=SavedScenario, operation_id="update_scenario"
    )
    def update_scenario(scenario_id: str, change: PortfolioUpdate) -> SavedScenario:
        store().resolve(change.request)
        return portfolios.update(scenario_id, change)

    @app.get(
        "/portfolio/{scenario_id}/runs",
        response_model=list[PortfolioExecution],
        operation_id="scenario_history",
    )
    def scenario_history(scenario_id: str) -> list[PortfolioExecution]:
        return portfolios.history(scenario_id, store())

    @app.post(
        "/portfolio/{scenario_id}/runs",
        response_model=PortfolioExecution,
        status_code=201,
        operation_id="launch_scenario",
        responses={202: {"model": PortfolioExecution}},
    )
    def launch_scenario(
        scenario_id: str, launch: LaunchRequest, response: Response, tasks: BackgroundTasks
    ) -> PortfolioExecution:
        saved = portfolios.get(scenario_id)
        if saved.revision != launch.revision:
            raise HTTPException(409, "Scenario changed. Reload before launching.")
        if launch.execution_id is not None:
            original = next(
                (
                    row
                    for row in portfolios.history(scenario_id, store())
                    if row.id == launch.execution_id
                ),
                None,
            )
            if original is None:
                raise HTTPException(404, "Unknown historical execution")
            saved = saved.model_copy(
                update={
                    "name": original.name,
                    "notes": original.notes,
                    "request": original.request,
                    "revision": original.revision,
                }
            )
        repository = store()
        status, created = repository.reserve(saved.request)
        execution = portfolios.record(saved, status)
        if created:
            if saved.request.replications == 1:
                repository.compute(status.run_id)
                execution.status = repository.status(status.run_id)
            else:
                tasks.add_task(repository.compute, status.run_id)
        if execution.status.status in {"queued", "running"}:
            response.status_code = 202
        return execution

    @app.get(
        "/runs/{run_id}/diagnostics", response_model=RunDiagnostics, operation_id="get_diagnostics"
    )
    def get_diagnostics(run_id: str) -> RunDiagnostics:
        path = store().ready(run_id) / "diagnostics.json"
        if not path.is_file():
            raise HTTPException(
                404, "Diagnostics are unavailable for this historical run. Rerun its request."
            )
        return RunDiagnostics.model_validate_json(path.read_text(encoding="utf-8"))

    @app.get(
        "/runs/{run_id}/provenance", response_model=RunProvenance, operation_id="get_provenance"
    )
    def get_provenance(run_id: str) -> RunProvenance:
        manifest = json.loads((store().ready(run_id) / "manifest.json").read_text(encoding="utf-8"))
        return RunProvenance.model_validate(
            {key: manifest[key] for key in RunProvenance.model_fields if key in manifest}
        )

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
        metrics: Annotated[list[SeriesMetric] | None, Parameter()] = None,
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

    app.include_router(case_router(portfolios, store))
    return app


app = create_app()
