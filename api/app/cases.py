"""Revisioned investigations and durable, immutable paired-run evidence."""

import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import yaml
from fastapi import APIRouter, BackgroundTasks, HTTPException, Response
from scm.contracts import (
    AttachCaseRuns,
    CaseDetail,
    CaseEvidence,
    CaseExecution,
    CasePackage,
    DecisionCaseDraft,
    DecisionCaseUpdate,
    LaunchRequest,
    RunDiagnostics,
    RunProvenance,
    SavedDecisionCase,
)

from api.app.portfolio import PortfolioStore
from api.app.service import RunStore


def draft_of(case: SavedDecisionCase) -> DecisionCaseDraft:
    return DecisionCaseDraft.model_validate(
        case.model_dump(include=set(DecisionCaseDraft.model_fields))
    )


class CaseStore:
    def __init__(self, portfolio: PortfolioStore):
        self.connection = portfolio.connection
        self.limits = yaml.safe_load(Path("configs/cases.yaml").read_text(encoding="utf-8"))
        with self.connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS decision_cases "
                "(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS case_revisions "
                "(id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, "
                "PRIMARY KEY(id,revision))"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS case_executions "
                "(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES decision_cases(id), "
                "data TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS case_evidence "
                "(execution_id TEXT PRIMARY KEY REFERENCES case_executions(id), data TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS case_imports "
                "(case_id TEXT PRIMARY KEY REFERENCES decision_cases(id), data TEXT NOT NULL)"
            )

    def get(self, identity: str) -> SavedDecisionCase:
        with self.connection() as db:
            row = db.execute("SELECT data FROM decision_cases WHERE id=?", (identity,)).fetchone()
        if row is None:
            raise HTTPException(404, "Unknown decision case")
        return SavedDecisionCase.model_validate_json(row[0])

    def require_revision(self, identity: str, revision: int) -> SavedDecisionCase:
        case = self.get(identity)
        if case.revision != revision:
            raise HTTPException(
                409, "Case changed. Reload the latest revision before saving or launching."
            )
        return case

    def create(
        self, draft: DecisionCaseDraft, evidence: CaseEvidence | None = None
    ) -> SavedDecisionCase:
        now = datetime.now(UTC).isoformat()
        case = SavedDecisionCase(
            **draft.model_dump(), id=uuid4().hex, revision=1, created_at=now, updated_at=now
        )
        with self.connection() as db:
            db.execute(
                "INSERT INTO decision_cases VALUES (?,?,?)", (case.id, 1, case.model_dump_json())
            )
            db.execute(
                "INSERT INTO case_revisions VALUES (?,?,?)", (case.id, 1, case.model_dump_json())
            )
            if evidence is not None:
                db.execute(
                    "INSERT INTO case_imports VALUES (?,?)", (case.id, evidence.model_dump_json())
                )
        return case

    def update(self, identity: str, change: DecisionCaseUpdate) -> SavedDecisionCase:
        old = self.require_revision(identity, change.revision)
        case = SavedDecisionCase(
            **change.model_dump(exclude={"revision"}),
            id=identity,
            revision=old.revision + 1,
            created_at=old.created_at,
            updated_at=datetime.now(UTC).isoformat(),
        )
        with self.connection() as db:
            result = db.execute(
                "UPDATE decision_cases SET revision=?,data=? WHERE id=? AND revision=?",
                (case.revision, case.model_dump_json(), identity, change.revision),
            )
            if result.rowcount != 1:
                raise HTTPException(409, "Case changed. Reload before saving.")
            db.execute(
                "INSERT INTO case_revisions VALUES (?,?,?)",
                (identity, case.revision, case.model_dump_json()),
            )
        return case

    def detail(self, identity: str) -> CaseDetail:
        case = self.get(identity)
        with self.connection() as db:
            row = db.execute(
                "SELECT data FROM case_imports WHERE case_id=?", (identity,)
            ).fetchone()
        return CaseDetail(
            case=case, imported_evidence=CaseEvidence.model_validate_json(row[0]) if row else None
        )

    def record(self, case: SavedDecisionCase, pair: list[str], origin: str) -> CaseExecution:
        value = CaseExecution.model_validate(
            dict(
                id=uuid4().hex,
                case_id=case.id,
                launched_at=datetime.now(UTC).isoformat(),
                origin=origin,
                snapshot=case,
                run_a=pair[0],
                run_b=pair[1],
            )
        )
        with self.connection() as db:
            db.execute(
                "INSERT INTO case_executions VALUES (?,?,?)",
                (value.id, case.id, value.model_dump_json()),
            )
        return value

    def execution(self, identity: str, execution: str) -> CaseExecution:
        self.get(identity)
        with self.connection() as db:
            row = db.execute(
                "SELECT data FROM case_executions WHERE id=? AND case_id=?", (execution, identity)
            ).fetchone()
        if row is None:
            raise HTTPException(404, "Unknown case execution")
        return CaseExecution.model_validate_json(row[0])

    def refresh(self, value: CaseExecution, runs: RunStore) -> CaseExecution:
        for field, identity in (("status_a", value.run_a), ("status_b", value.run_b)):
            try:
                setattr(value, field, runs.status(identity))
            except HTTPException as exc:
                if exc.status_code != 404:
                    raise
                setattr(value, field, None)
        with self.connection() as db:
            value.evidence_available = (
                db.execute(
                    "SELECT 1 FROM case_evidence WHERE execution_id=?", (value.id,)
                ).fetchone()
                is not None
            )
        return value

    def capture(self, value: CaseExecution, runs: RunStore) -> CaseEvidence:
        with self.connection() as db:
            row = db.execute(
                "SELECT data FROM case_evidence WHERE execution_id=?", (value.id,)
            ).fetchone()
        if row:
            return CaseEvidence.model_validate_json(row[0])
        value = self.refresh(value, runs)
        if (
            value.status_a is None
            or value.status_b is None
            or any(s.status != "complete" for s in (value.status_a, value.status_b))
        ):
            raise HTTPException(409, "Both conditions must complete before evidence is available")
        provenance = []
        for identity in (value.run_a, value.run_b):
            manifest = json.loads(
                (runs.ready(identity) / "manifest.json").read_text(encoding="utf-8")
            )
            provenance.append(
                RunProvenance.model_validate(
                    {k: manifest[k] for k in RunProvenance.model_fields if k in manifest}
                )
            )
        diagnostic = runs.ready(value.run_b) / "diagnostics.json"
        value.evidence_available = True
        evidence = CaseEvidence(
            execution=value,
            comparison=runs.compare(value.run_a, value.run_b),
            a=runs.kpis(value.run_a),
            b=runs.kpis(value.run_b),
            provenance=provenance,
            diagnostics=RunDiagnostics.model_validate_json(diagnostic.read_text(encoding="utf-8"))
            if diagnostic.is_file()
            else None,
        )
        with self.connection() as db:
            db.execute(
                "INSERT OR IGNORE INTO case_evidence VALUES (?,?)",
                (value.id, evidence.model_dump_json()),
            )
            stored = db.execute(
                "SELECT data FROM case_evidence WHERE execution_id=?", (value.id,)
            ).fetchone()
        assert stored is not None
        return CaseEvidence.model_validate_json(stored[0])

    def history(self, identity: str, runs: RunStore) -> list[CaseExecution]:
        self.get(identity)
        with self.connection() as db:
            rows = db.execute(
                "SELECT data FROM case_executions WHERE case_id=? ORDER BY rowid DESC LIMIT ?",
                (identity, self.limits["history_limit"]),
            ).fetchall()
        values = [self.refresh(CaseExecution.model_validate_json(row[0]), runs) for row in rows]
        for value in values:
            if (
                not value.evidence_available
                and value.status_a is not None
                and value.status_b is not None
                and value.status_a.status == value.status_b.status == "complete"
            ):
                self.capture(value, runs)
                value.evidence_available = True
        return values


def case_router(portfolio: PortfolioStore, source: Callable[[], RunStore]) -> APIRouter:
    router = APIRouter()
    cases = CaseStore(portfolio)

    def validate(draft: DecisionCaseDraft) -> DecisionCaseDraft:
        resolved = [source().resolve(r) for r in (draft.baseline, draft.alternative)]
        if (resolved[0][0].warmup_days, resolved[0][0].horizon_days) != (
            resolved[1][0].warmup_days,
            resolved[1][0].horizon_days,
        ):
            raise HTTPException(
                422, "Case conditions require matching warmup and observation windows"
            )
        for field in ("suppliers", "dcs", "customers", "skus"):
            a = getattr(resolved[0][1].spec, field, [])
            b = getattr(resolved[1][1].spec, field, [])
            if [r.id for r in a] != [r.id for r in b]:
                raise HTTPException(
                    422, "Case conditions require the same ordered facility and SKU masters"
                )
        return draft

    @router.get("/cases", response_model=list[SavedDecisionCase], operation_id="list_cases")
    def listing() -> list[SavedDecisionCase]:
        with cases.connection() as db:
            rows = db.execute("SELECT data FROM decision_cases ORDER BY rowid DESC").fetchall()
        return [SavedDecisionCase.model_validate_json(row[0]) for row in rows]

    @router.post("/cases/validate", response_model=DecisionCaseDraft, operation_id="validate_case")
    def validate_case(draft: DecisionCaseDraft) -> DecisionCaseDraft:
        return validate(draft)

    @router.post(
        "/cases/import",
        response_model=SavedDecisionCase,
        status_code=201,
        operation_id="import_case",
    )
    def import_case(package: CasePackage) -> SavedDecisionCase:
        if len(package.model_dump_json().encode()) > cases.limits["max_package_bytes"]:
            raise HTTPException(422, "Case package exceeds the documented local workspace limit")
        return cases.create(validate(package.definition), package.evidence)

    @router.post(
        "/cases", response_model=SavedDecisionCase, status_code=201, operation_id="create_case"
    )
    def create(draft: DecisionCaseDraft) -> SavedDecisionCase:
        return cases.create(validate(draft))

    @router.get("/cases/{identity}", response_model=CaseDetail, operation_id="get_case")
    def detail(identity: str) -> CaseDetail:
        return cases.detail(identity)

    @router.put("/cases/{identity}", response_model=SavedDecisionCase, operation_id="update_case")
    def update(identity: str, change: DecisionCaseUpdate) -> SavedDecisionCase:
        validate(change)
        return cases.update(identity, change)

    @router.get(
        "/cases/{identity}/revisions",
        response_model=list[SavedDecisionCase],
        operation_id="case_revisions",
    )
    def revisions(identity: str) -> list[SavedDecisionCase]:
        cases.get(identity)
        with cases.connection() as db:
            rows = db.execute(
                "SELECT data FROM case_revisions WHERE id=? ORDER BY revision DESC", (identity,)
            ).fetchall()
        return [SavedDecisionCase.model_validate_json(row[0]) for row in rows]

    @router.get(
        "/cases/{identity}/runs", response_model=list[CaseExecution], operation_id="case_history"
    )
    def history(identity: str) -> list[CaseExecution]:
        return cases.history(identity, source())

    def compute(value: CaseExecution, queued: list[str]) -> None:
        for identity in queued:
            source().compute(identity)
        if all(
            source().status(identity).status == "complete"
            for identity in (value.run_a, value.run_b)
        ):
            cases.capture(value, source())

    @router.post(
        "/cases/{identity}/runs",
        response_model=CaseExecution,
        status_code=201,
        operation_id="launch_case",
    )
    def launch(
        identity: str, body: LaunchRequest, tasks: BackgroundTasks, response: Response
    ) -> CaseExecution:
        if body.execution_id is not None:
            raise HTTPException(422, "Restore a historical case revision before rerunning it")
        case = cases.require_revision(identity, body.revision)
        validate(case)
        if not case.prediction.strip() or all(v is None for v in case.goals.model_dump().values()):
            raise HTTPException(
                422, "Record a prediction and at least one acceptance goal before launching"
            )
        pair = source().reserve_pair(case.baseline, case.alternative)
        value = cases.record(case, [s.run_id for s, _ in pair], "case_launch")
        queued = [s.run_id for s, created in pair if created]
        if case.baseline.replications == 1:
            compute(value, queued)
        else:
            tasks.add_task(compute, value, queued)
            response.status_code = 202
        return cases.refresh(value, source())

    @router.post(
        "/cases/{identity}/attach",
        response_model=CaseExecution,
        status_code=201,
        operation_id="attach_case_runs",
    )
    def attach(identity: str, body: AttachCaseRuns) -> CaseExecution:
        case = cases.require_revision(identity, body.revision)
        validate(case)
        expected = [source().manifest(r)["run_id"] for r in (case.baseline, case.alternative)]
        if expected != [body.run_a, body.run_b]:
            raise HTTPException(
                409, "Run pair does not match this case's ordered conditions and current sources"
            )
        source().compare(body.run_a, body.run_b)
        value = cases.record(case, expected, "attached")
        cases.capture(value, source())
        return cases.refresh(value, source())

    @router.get(
        "/cases/{identity}/runs/{execution}/evidence",
        response_model=CaseEvidence,
        operation_id="get_case_evidence",
    )
    def evidence(identity: str, execution: str) -> CaseEvidence:
        return cases.capture(cases.execution(identity, execution), source())

    @router.get("/cases/{identity}/package", response_model=CasePackage, operation_id="export_case")
    def package(
        identity: str, execution_id: str | None = None, archive: bool = False
    ) -> CasePackage:
        definition = draft_of(cases.get(identity))
        data: CaseEvidence | None
        if archive:
            data = cases.detail(identity).imported_evidence
            if data is None:
                raise HTTPException(404, "This case has no imported evidence archive")
        elif execution_id is not None:
            data = evidence(identity, execution_id)
        else:
            history = cases.history(identity, source())
            latest = next((r for r in history if r.evidence_available), None)
            data = (
                evidence(identity, latest.id)
                if latest
                else cases.detail(identity).imported_evidence
            )
        return CasePackage(format="openscm-case-v1", definition=definition, evidence=data)

    return router
