import json
from pathlib import Path

import numpy as np
import pytest
import yaml
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, ValidationError
from scm.config.api import load_api_settings
from scm.contracts import RunRequest

from api.app.main import create_app
from api.app.service import RunStore, write_json


def test_extended_series_schema_retains_a_bounded_metric_vocabulary() -> None:
    fixture = json.loads(Path("contracts/fixtures/timeseries.json").read_text())
    fixture["metrics"]["invented_result"] = [0, 0, 0]
    schema = json.loads(Path("contracts/timeseries.schema.json").read_text())
    with pytest.raises(ValidationError):
        Draft202012Validator(schema).validate(fixture)


def test_atomic_status_write_retries_windows_sharing_errors_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "status.json"
    path.write_text('{"status":"queued"}')
    replace = Path.replace
    attempts = []

    def busy(source: Path, target: Path) -> Path:
        attempts.append(target)
        if len(attempts) < 3:
            error = PermissionError("Temporarily open by a status reader")
            error.winerror = 5
            raise error
        return replace(source, target)

    monkeypatch.setattr(Path, "replace", busy)
    write_json(path, {"status": "running"})
    assert len(attempts) == 3
    assert json.loads(path.read_text()) == {"status": "running"}

    def forbidden(source: Path, target: Path) -> Path:
        raise PermissionError("Actual write permission failure")

    monkeypatch.setattr(Path, "replace", forbidden)
    with pytest.raises(PermissionError):
        write_json(path, {"status": "complete"})
    assert json.loads(path.read_text()) == {"status": "running"}

    attempts.clear()

    def persistently_busy(source: Path, target: Path) -> Path:
        attempts.append(target)
        error = PermissionError("Persistent Windows lock")
        error.winerror = 32
        raise error

    monkeypatch.setattr(Path, "replace", persistently_busy)
    with pytest.raises(PermissionError):
        write_json(path, {"status": "complete"})
    assert len(attempts) == 5
    assert json.loads(path.read_text()) == {"status": "running"}


def test_learning_experiments_are_valid_paired_requests(tmp_path: Path) -> None:
    catalog = yaml.safe_load(Path("configs/learning.yaml").read_text(encoding="utf-8"))
    assert catalog == json.loads(Path("web/src/fixtures/learning.json").read_text(encoding="utf-8"))
    assert len(catalog["lessons"]) >= 10
    assert len({row["id"] for row in catalog["lessons"]}) == len(catalog["lessons"])
    store = RunStore(tmp_path, load_api_settings())
    for lesson in catalog["lessons"]:
        a, b = (RunRequest.model_validate(lesson[key]) for key in ("request_a", "request_b"))
        assert a != b
        assert (a.seed, a.replications, a.overrides.warmup_days, a.overrides.horizon_days) == (
            b.seed,
            b.replications,
            b.overrides.warmup_days,
            b.overrides.horizon_days,
        )
        assert lesson["assumption"].startswith("ASSUMPTION:")
        assert lesson["mechanism"] and lesson["reflect"] and lesson["watch"]
        store.resolve(a)
        store.resolve(b)


def test_learning_series_reconcile_to_replication_arrays_and_keep_legacy_reads(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(run_root=tmp_path / "runs"))
    response = client.post(
        "/runs",
        json={
            "seed": 453,
            "options": {"forecasting": True},
            "overrides": {"warmup_days": 7, "horizon_days": 21},
        },
    )
    assert response.status_code == 201, response.text
    run_id = response.json()["run_id"]
    names = ["demand", "immediate", "received", "orders", "forecast"]
    params = {"node": "R01", "sku": "SKU01", "metrics": names}
    series = client.get(f"/runs/{run_id}/timeseries", params=params)
    assert series.status_code == 200, series.text
    values = series.json()["metrics"]
    assert set(values) == set(names)
    assert all(len(values[name]) == 21 for name in names)
    assert sum(values["immediate"]) <= sum(values["demand"])
    diagnostics = client.get(f"/runs/{run_id}/diagnostics").json()
    shortfall = np.subtract(values["demand"], values["immediate"]).sum()
    assert (
        shortfall
        <= next(row["shortage_units"] for row in diagnostics["skus"] if row["id"] == "SKU01") + 1e-8
    )
    folder = tmp_path / "runs" / run_id
    historical = json.loads((folder / "network.json").read_text())
    historical.pop("warmup_days", None)
    (folder / "network.json").write_text(json.dumps(historical))
    network = client.get(f"/runs/{run_id}/network").json()
    assert network["warmup_days"] == 7
    node = network["network"]["nodes"]["id"].index("R01")
    with np.load(folder / "arrays.npz") as arrays:
        retained = {name: arrays[name] for name in arrays.files if name not in names}
        for name in names:
            assert values[name] == pytest.approx(arrays[name][7:, 0, node].tolist())
        customers = np.isin(network["network"]["nodes"]["type"], ["retailer", "b2b"])
        for index, row in enumerate(diagnostics["skus"]):
            demand = arrays["demand"][7:, index, :][:, customers].sum()
            immediate = arrays["immediate"][7:, index, :][:, customers].sum()
            assert demand == pytest.approx(row["demand_units"])
            assert demand - immediate == pytest.approx(row["shortage_units"])
        assert np.isnan(arrays["forecast"][:, :, 0]).all()
        assert np.isfinite(arrays["forecast"][:, :, node]).all()
    np.savez_compressed(folder / "arrays.npz", **retained)
    assert (
        client.get(
            f"/runs/{run_id}/timeseries", params={**params, "metrics": ["on_hand"]}
        ).status_code
        == 200
    )
    unavailable = client.get(f"/runs/{run_id}/timeseries", params=params)
    assert unavailable.status_code == 409
    assert "Rerun" in unavailable.json()["detail"]


def test_known_demand_policies_do_not_invent_forecast_observations(tmp_path: Path) -> None:
    client = TestClient(create_app(run_root=tmp_path))
    run = client.post("/runs", json={"overrides": {"warmup_days": 0, "horizon_days": 7}}).json()
    series = client.get(
        f"/runs/{run['run_id']}/timeseries",
        params={
            "node": "R01",
            "sku": "SKU01",
            "metrics": ["forecast", "demand"],
        },
    ).json()
    assert series["metrics"]["forecast"] == [None] * 7
    assert sum(series["metrics"]["demand"]) > 0
