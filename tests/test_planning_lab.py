import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from scm.config.lab import configure_study
from scm.config.loader import load_study
from scm.contracts import LabSettings

from api.app.main import create_app


def request() -> dict[str, object]:
    return {"seed": 222, "replications": 1, "overrides": {"warmup_days": 7, "horizon_days": 21}}


def test_lab_assumptions_apply_without_mutating_the_source() -> None:
    study = load_study()
    changed = configure_study(
        study,
        LabSettings.model_validate(
            {
                "monthly_index": [1.5] * 12,
                "dc_capacity_factor": 0.5,
                "suppliers": {"S4": {"delay_probability": 0.4, "daily_capacity": 700}},
            }
        ),
    )
    assert changed.seasonality.monthly_index_v1 == [1.5] * 12
    assert changed.spec.dcs[0].daily_capacity == study.spec.dcs[0].daily_capacity / 2
    assert changed.spec.suppliers[3].delay_probability == 0.4
    assert study.spec.suppliers[3].delay_probability == 0.01
    with pytest.raises(ValueError, match="supplier"):
        configure_study(study, LabSettings.model_validate({"suppliers": {"UNKNOWN": {"moq": 2}}}))


@pytest.mark.parametrize(
    "values",
    [
        {"monthly_index": [1] * 11},
        {"forecast_alpha": 0},
        {"suppliers": {"S4": {"delay_probability": 1.1}}},
        {"dc_capacity_factor": -1},
        {"backup_suppliers": {"S4": "S4"}},
    ],
)
def test_invalid_lab_assumptions_are_rejected(values: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        LabSettings.model_validate(values)


def test_portfolio_restart_revision_and_immutable_run_history(tmp_path: Path) -> None:
    root = tmp_path / "runs"
    with TestClient(create_app(run_root=root)) as client:
        saved = client.post(
            "/portfolio",
            json={
                "name": "Monsoon planning",
                "notes": "Synthetic assumption",
                "request": request(),
            },
        )
        assert saved.status_code == 201, saved.text
        scenario = saved.json()
        launched = client.post(f"/portfolio/{scenario['id']}/runs", json={"revision": 1})
        assert launched.status_code == 201, launched.text
        assert launched.json()["status"]["status"] == "complete"
        edited = client.put(
            f"/portfolio/{scenario['id']}",
            json={
                "revision": 1,
                "name": "Updated plan",
                "notes": "Keep the original evidence",
                "request": request() | {"seed": 223},
            },
        )
        assert edited.status_code == 200
        assert edited.json()["revision"] == 2
        assert (
            client.put(
                f"/portfolio/{scenario['id']}",
                json={"revision": 1, "name": "Stale", "request": request()},
            ).status_code
            == 409
        )
        assert (
            client.post(f"/portfolio/{scenario['id']}/runs", json={"revision": 1}).status_code
            == 409
        )
    with TestClient(create_app(run_root=root)) as client:
        assert client.get("/portfolio").json()[0]["name"] == "Updated plan"
        history = client.get(f"/portfolio/{scenario['id']}/runs").json()
        assert history[0]["revision"] == 1
        assert history[0]["request"]["seed"] == 222
        assert history[0]["notes"] == "Synthetic assumption"
        repeat = client.post(
            f"/portfolio/{scenario['id']}/runs",
            json={"revision": 2, "execution_id": history[0]["id"]},
        )
        assert repeat.json()["request"]["seed"] == 222
        assert repeat.json()["revision"] == 1
        assert (
            client.post(f"/portfolio/{scenario['id']}/runs", json={"revision": 2}).json()[
                "request"
            ]["seed"]
            == 223
        )


def test_diagnostics_reconcile_costs_shortages_inventory_and_lane_freight(tmp_path: Path) -> None:
    with TestClient(create_app(run_root=tmp_path / "runs")) as client:
        body = request() | {
            "options": {"forecasting": True},
            "lab": {
                "monthly_index": [1.1] * 12,
                "buffer_days": 2,
                "backup_suppliers": {"S4": "S1"},
                "expedite_factor": 0.8,
                "expedite_unit_cost": 1,
            },
        }
        created = client.post("/runs", json=body)
        assert created.status_code == 201, created.text
        run_id = created.json()["run_id"]
        result = client.get(f"/runs/{run_id}/diagnostics")
        assert result.status_code == 200, result.text
        data = result.json()
        kpis = client.get(f"/runs/{run_id}/kpis").json()["metrics"]
        assert sum(row["cost_inr"] for row in data["facilities"]) == pytest.approx(
            kpis["total_landed_cost_inr"]["mean"]
        )
        assert sum(row["shortage_units"] for row in data["skus"]) == pytest.approx(
            sum(
                row["shortage_units"]
                for row in data["facilities"]
                if row["kind"] in {"retailer", "b2b"}
            )
        )
        assert sum(row["inventory_value_inr"] for row in data["skus"]) == pytest.approx(
            sum(row["inventory_value_inr"] for row in data["facilities"])
        )
        assert sum(row["freight_inr"] for row in data["lanes"]) == pytest.approx(
            sum(data["cost_components"][key] for key in ("inbound_freight", "outbound_freight"))
        )
        assert all(row["forecast_wmape"] is not None for row in data["skus"])
        assert data["representative_seed"] == created.json()["representative_seed"]
        provenance = client.get(f"/runs/{run_id}/provenance").json()
        assert provenance["request"]["lab"]["buffer_days"] == 2
        assert provenance["operating_snapshot"]["planning_enabled"] is True
        assert provenance["operating_snapshot"]["planning"]["segmented"] is False
        assert np.isfinite(data["facilities"][0]["cost_inr"])
        assert client.post("/runs", json=body).json()["run_id"] == run_id


def test_seasonal_demand_changes_actual_draws_and_paired_versions_are_checked(
    tmp_path: Path,
) -> None:
    root = tmp_path / "runs"
    with TestClient(create_app(run_root=root)) as client:
        ids = []
        totals = []
        for index in (0.5, 1.5):
            body = request() | {
                "overrides": {"warmup_days": 7, "horizon_days": 21, "demand": {"cv_scale": 0}},
                "lab": {"monthly_index": [index] * 12},
            }
            run = client.post("/runs", json=body)
            assert run.status_code == 201, run.text
            ids.append(run.json()["run_id"])
            rows = client.get(f"/runs/{ids[-1]}/diagnostics").json()["skus"]
            totals.append(sum(row["demand_units"] for row in rows))
        assert totals[1] == pytest.approx(totals[0] * 3)
        assert client.get("/compare", params={"a": ids[0], "b": ids[1]}).status_code == 200
        path = root / ids[1] / "manifest.json"
        manifest = json.loads(path.read_text())
        manifest["input_sha256"]["changed_model"] = "new_version"
        path.write_text(json.dumps(manifest))
        assert client.get("/compare", params={"a": ids[0], "b": ids[1]}).status_code == 409


def test_invalid_targets_cannot_be_saved_or_validated(tmp_path: Path) -> None:
    with TestClient(create_app(run_root=tmp_path / "runs")) as client:
        invalid = request() | {"lab": {"backup_suppliers": {"S4": "unknown"}}}
        assert client.post("/lab/validate", json=invalid).status_code == 422
        assert (
            client.post("/portfolio", json={"name": "Invalid", "request": invalid}).status_code
            == 422
        )
        assert client.get("/portfolio").json() == []
