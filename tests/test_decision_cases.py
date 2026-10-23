"""Decision cases preserve investigations independently of the simulation cache."""

import json
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.app.main import create_app


def definition() -> dict[str, Any]:
    request = {"seed": 222, "replications": 1, "overrides": {"warmup_days": 7, "horizon_days": 21}}
    return {
        "format_version": 1,
        "name": "Dispatch capacity investigation",
        "question": "Does restricted DC dispatch reduce customer fill?",
        "assumptions": "ASSUMPTION: synthetic teaching network; acceptance target is illustrative.",
        "prediction": "Inventory may not protect customers when dispatch is constrained.",
        "observations": "Inspect downstream receipts and dispatch utilization.",
        "reflection": "",
        "decision": "",
        "lesson_id": "capacity",
        "goals": {"service_floor": 0.95, "cost_ceiling_inr": None, "inventory_ceiling_days": None},
        "baseline": request,
        "alternative": request | {"lab": {"dc_capacity_factor": 0.35}},
    }


def test_case_restart_conflict_revisions_and_immutable_pair_evidence(tmp_path: Path) -> None:
    root = tmp_path / "runs"
    with TestClient(create_app(run_root=root)) as client:
        saved = client.post("/cases", json=definition())
        assert saved.status_code == 201, saved.text
        case = saved.json()
        identity = case["id"]
        launched = client.post(f"/cases/{identity}/runs", json={"revision": 1})
        assert launched.status_code in {201, 202}, launched.text
        execution = launched.json()
        assert execution["snapshot"]["prediction"] == definition()["prediction"]
        assert execution["run_a"] != execution["run_b"]
        evidence = client.get(f"/cases/{identity}/runs/{execution['id']}/evidence")
        assert evidence.status_code == 200, evidence.text
        data = evidence.json()
        assert data["comparison"]["run_b"] == execution["run_b"]
        assert len(data["provenance"]) == 2
        assert data["a"]["run_id"] == execution["run_a"]
        changed = definition() | {"decision": "Validate the remedy on independent seeds."}
        updated = client.put(f"/cases/{identity}", json=changed | {"revision": 1})
        assert updated.status_code == 200
        assert updated.json()["revision"] == 2
        assert client.put(f"/cases/{identity}", json=changed | {"revision": 1}).status_code == 409
        assert client.post(f"/cases/{identity}/runs", json={"revision": 1}).status_code == 409
        assert client.get(f"/cases/{identity}/revisions").json()[1]["decision"] == ""
    shutil.rmtree(root)
    with TestClient(create_app(run_root=root)) as client:
        detail = client.get(f"/cases/{identity}").json()
        assert detail["case"]["decision"] == changed["decision"]
        history = client.get(f"/cases/{identity}/runs").json()
        assert history[0]["status_a"] is None and history[0]["status_b"] is None
        assert history[0]["evidence_available"] is True
        assert history[0]["snapshot"]["decision"] == ""
        assert client.get(f"/cases/{identity}/runs/{execution['id']}/evidence").json() == data
        package = client.get(f"/cases/{identity}/package").json()
        assert package["definition"]["decision"] == changed["decision"]
        assert package["evidence"]["execution"]["snapshot"]["decision"] == ""
        imported = client.post("/cases/import", json=package)
        assert imported.status_code == 201, imported.text
        assert imported.json()["id"] != identity
        assert (
            client.get(f"/cases/{imported.json()['id']}").json()["imported_evidence"]
            == package["evidence"]
        )
        assert client.get(f"/cases/{imported.json()['id']}/runs").json() == []
        imported_id = imported.json()["id"]
        assert client.post(f"/cases/{imported_id}/runs", json={"revision": 1}).status_code == 201
        archived = client.get(f"/cases/{imported_id}/package?archive=true").json()
        assert archived["evidence"] == package["evidence"]


@pytest.mark.parametrize(
    "change",
    [
        {"format_version": 2},
        {"name": "  "},
        {"question": ""},
        {"goals": {"service_floor": 1.1}},
        {"goals": {"inventory_ceiling_days": -1}},
        {"alternative": {"seed": 999}},
        {"alternative": {"seed": 222, "replications": 2}},
        {"alternative": {"seed": 222, "replications": 1, "overrides": {"horizon_days": 20}}},
    ],
)
def test_invalid_case_does_not_create_definitions_or_runs(
    tmp_path: Path, change: dict[str, Any]
) -> None:
    with TestClient(create_app(run_root=tmp_path / "runs")) as client:
        response = client.post("/cases", json=definition() | change)
        assert response.status_code == 422, response.text
        assert client.get("/cases").json() == []
        assert not list((tmp_path / "runs").glob("*/status.json"))


def test_case_attachment_checks_physics_and_keeps_existing_portfolio(tmp_path: Path) -> None:
    with TestClient(create_app(run_root=tmp_path / "runs")) as client:
        draft = definition()
        legacy = client.post(
            "/portfolio", json={"name": "Legacy plan", "request": draft["baseline"]}
        )
        assert legacy.status_code == 201
        case = client.post("/cases", json=draft).json()
        a = client.post("/runs", json=draft["baseline"]).json()["run_id"]
        b = client.post("/runs", json=draft["alternative"]).json()["run_id"]
        assert (
            client.post(
                f"/cases/{case['id']}/attach", json={"revision": 1, "run_a": b, "run_b": a}
            ).status_code
            == 409
        )
        attached = client.post(
            f"/cases/{case['id']}/attach", json={"revision": 1, "run_a": a, "run_b": b}
        )
        assert attached.status_code == 201, attached.text
        assert attached.json()["origin"] == "attached"
        assert client.get("/portfolio").json()[0]["id"] == legacy.json()["id"]
        assert client.get("/cases/unknown").status_code == 404
        assert client.get(f"/cases/{case['id']}/runs/unknown/evidence").status_code == 404
        assert (
            client.post(
                "/cases/import", json={"format": "unsupported", "definition": draft}
            ).status_code
            == 422
        )


def test_case_requires_goals_and_prediction_before_launch(tmp_path: Path) -> None:
    with TestClient(create_app(run_root=tmp_path / "runs")) as client:
        changes: dict[str, Any]
        for changes in ({"prediction": ""}, {"goals": {}}):
            case = client.post("/cases", json=definition() | changes).json()
            result = client.post(f"/cases/{case['id']}/runs", json={"revision": 1})
            assert result.status_code == 422, result.text
        assert not list((tmp_path / "runs").glob("*/status.json"))


def test_case_catalog_matches_documented_limits() -> None:
    assert yaml.safe_load(Path("configs/cases.yaml").read_text(encoding="utf-8")) == json.loads(
        Path("web/src/fixtures/cases.json").read_text(encoding="utf-8")
    )


def test_case_queue_reservation_is_atomic_and_saved_request_identity_is_stable(
    tmp_path: Path,
) -> None:
    from scm.config.api import load_api_settings
    from scm.contracts import RunRequest

    from api.app.service import RunStore

    source = RunStore(
        tmp_path / "runs", load_api_settings().model_copy(update={"max_pending_runs": 1})
    )
    a = RunRequest.model_validate(definition()["baseline"])
    b = RunRequest.model_validate(definition()["alternative"])
    assert (
        source.manifest(a)["run_id"]
        == source.manifest(RunRequest.model_validate_json(a.model_dump_json()))["run_id"]
    )
    with pytest.raises(HTTPException) as failure:
        source.reserve_pair(a, b)
    assert getattr(failure.value, "status_code", None) == 503
    assert not source.pending and not list((tmp_path / "runs").glob("*/status.json"))
    pair = source.reserve_pair(a, a)
    assert pair[0][1] is True and pair[1][1] is False


def test_case_rejects_incompatible_customer_master_and_misaligned_import(tmp_path: Path) -> None:
    with TestClient(create_app(run_root=tmp_path / "runs")) as client:
        model = client.get("/models/catalog").json()["request"]["model"]
        draft = definition()
        draft["baseline"]["model"] = model
        draft["alternative"]["model"] = json.loads(json.dumps(model))
        draft["alternative"]["model"]["spec"]["customers"][0]["id"] = "DifferentCustomer"
        assert client.post("/cases", json=draft).status_code == 422
        package = json.loads(
            Path("contracts/fixtures/case_package.json").read_text(encoding="utf-8")
        )
        package["evidence"]["provenance"][0]["request"]["seed"] += 1
        assert client.post("/cases/import", json=package).status_code == 422
        assert client.get("/cases").json() == []


def test_run_polling_recovers_from_transient_windows_read_lock(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from scm.config.api import load_api_settings
    from scm.contracts import RunRequest

    from api.app.service import RunStore

    source = RunStore(tmp_path / "runs", load_api_settings())
    status, _ = source.reserve(RunRequest.model_validate(definition()["baseline"]))
    original = Path.read_text
    attempts = 0

    def locked(path: Path, *args: Any, **kwargs: Any) -> str:
        nonlocal attempts
        if path.name == "status.json":
            attempts += 1
            if attempts < 3:
                error = PermissionError("Windows sharing violation")
                error.winerror = 32
                raise error
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", locked)
    assert source.status(status.run_id) == status
    assert attempts == 3

    attempts = 0

    def persistently_locked(_path: Path, *args: Any, **kwargs: Any) -> str:
        nonlocal attempts
        attempts += 1
        error = PermissionError("Persistent sharing violation")
        error.winerror = 32
        raise error

    monkeypatch.setattr(Path, "read_text", persistently_locked)
    with pytest.raises(PermissionError, match="Persistent sharing"):
        source.status(status.run_id)
    assert attempts == 5

    def denied(_path: Path, *args: Any, **kwargs: Any) -> str:
        raise PermissionError("Not a transient Windows error")

    monkeypatch.setattr(Path, "read_text", denied)
    with pytest.raises(PermissionError, match="Not a transient"):
        source.status(status.run_id)
