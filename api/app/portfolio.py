"""SQLite scenario definitions and immutable launch snapshots for one local workspace."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from scm.contracts import (
    PortfolioDraft,
    PortfolioExecution,
    PortfolioUpdate,
    RunStatus,
    SavedScenario,
)

from api.app.service import RunStore


class PortfolioStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS scenarios "
                "(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS executions "
                "(id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL REFERENCES scenarios(id), "
                "data TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS scenario_revisions "
                "(id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, "
                "PRIMARY KEY(id,revision))"
            )
            connection.execute(
                "INSERT OR IGNORE INTO scenario_revisions SELECT id,revision,data FROM scenarios"
            )

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def list_scenarios(self) -> list[SavedScenario]:
        with self.connection() as connection:
            rows = connection.execute("SELECT data FROM scenarios").fetchall()
        return sorted(
            (SavedScenario.model_validate_json(row[0]) for row in rows),
            key=lambda row: (row.updated_at, row.id),
            reverse=True,
        )

    def get(self, identity: str) -> SavedScenario:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT data FROM scenarios WHERE id=?", (identity,)
            ).fetchone()
        if row is None:
            raise HTTPException(404, "Unknown saved scenario")
        return SavedScenario.model_validate_json(row[0])

    def create(self, draft: PortfolioDraft) -> SavedScenario:
        now = datetime.now(UTC).isoformat()
        value = SavedScenario(
            **draft.model_dump(), id=uuid4().hex, revision=1, created_at=now, updated_at=now
        )
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO scenarios VALUES (?,?,?)",
                (value.id, value.revision, value.model_dump_json()),
            )
            connection.execute(
                "INSERT INTO scenario_revisions VALUES (?,?,?)",
                (value.id, value.revision, value.model_dump_json()),
            )
        return value

    def update(self, identity: str, change: PortfolioUpdate) -> SavedScenario:
        previous = self.get(identity)
        value = SavedScenario(
            **change.model_dump(exclude={"revision"}),
            id=identity,
            revision=previous.revision + 1,
            created_at=previous.created_at,
            updated_at=datetime.now(UTC).isoformat(),
        )
        with self.connection() as connection:
            result = connection.execute(
                "UPDATE scenarios SET revision=?,data=? WHERE id=? AND revision=?",
                (value.revision, value.model_dump_json(), identity, change.revision),
            )
            if result.rowcount != 1:
                raise HTTPException(
                    409, "Scenario changed. Reload the latest revision before saving."
                )
            connection.execute(
                "INSERT INTO scenario_revisions VALUES (?,?,?)",
                (value.id, value.revision, value.model_dump_json()),
            )
        return value

    def revisions(self, identity: str) -> list[SavedScenario]:
        self.get(identity)
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT data FROM scenario_revisions WHERE id=? ORDER BY revision DESC", (identity,)
            ).fetchall()
        return [SavedScenario.model_validate_json(row[0]) for row in rows]

    def record(self, saved: SavedScenario, status: RunStatus) -> PortfolioExecution:
        value = PortfolioExecution(
            id=uuid4().hex,
            scenario_id=saved.id,
            revision=saved.revision,
            name=saved.name,
            notes=saved.notes,
            request=saved.request,
            launched_at=datetime.now(UTC).isoformat(),
            status=status,
        )
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO executions VALUES (?,?,?)",
                (value.id, saved.id, value.model_dump_json()),
            )
        return value

    def history(self, identity: str, runs: RunStore) -> list[PortfolioExecution]:
        self.get(identity)
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT data FROM executions WHERE scenario_id=?", (identity,)
            ).fetchall()
        values = [PortfolioExecution.model_validate(json.loads(row[0])) for row in rows]
        for value in values:
            try:
                value.status = runs.status(value.status.run_id)
            except HTTPException:
                value.status.status = "failed"
                value.status.error = (
                    "Run artifacts are unavailable; the immutable request can be rerun."
                )
        return sorted(values, key=lambda row: (row.launched_at, row.id), reverse=True)
