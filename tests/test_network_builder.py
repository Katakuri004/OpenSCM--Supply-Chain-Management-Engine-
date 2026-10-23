import copy
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.app.main import create_app


def test_custom_model_roundtrip_routing_and_run_provenance(tmp_path: Path) -> None:
    client = TestClient(create_app(run_root=tmp_path / "runs"))
    catalog = client.get("/models/catalog")
    assert catalog.status_code == 200
    request = catalog.json()["request"]
    spec = request["model"]["spec"]
    spec["suppliers"] = spec["suppliers"][:1]
    spec["dcs"] = spec["dcs"][:3]
    spec["customers"] = spec["customers"][:2]
    spec["skus"] = spec["skus"][:2]
    for sku in spec["skus"]:
        sku["supplier"] = "S1"
    for node in spec["customers"]:
        node["region"] = 0
    spec["open_dcs"] = [dc["id"] for dc in spec["dcs"]]
    spec["assignments"] = {"R01": "DC2", "R02": "DC1"}
    spec["lanes"] = [
        {"source": "DC2", "target": "R01", "distance_km": 17.0, "lead_mean": 2.0, "lead_cv": 0.0}
    ]
    request["overrides"] = {
        "network": {"dc_count": 3, "suppliers": ["S1"]},
        "warmup_days": 7,
        "horizon_days": 21,
    }
    request["replications"] = 1
    saved = client.post(
        "/portfolio",
        json={
            "name": "Student custom model",
            "notes": "ASSUMPTION: synthetic exercise",
            "request": request,
        },
    )
    assert saved.status_code == 201, saved.text
    request = saved.json()["request"]
    spec = request["model"]["spec"]
    launched = client.post(f"/portfolio/{saved.json()['id']}/runs", json={"revision": 1})
    assert launched.status_code == 201, launched.text
    run = launched.json()["status"]["run_id"]
    network = client.get(f"/runs/{run}/network").json()["network"]
    assert len(network["nodes"]["id"]) == 6
    assert network["edges"]["source"][-2:] == ["DC2", "DC1"]
    assert network["edges"]["distance_km"][-2] == 17.0
    provenance = client.get(f"/runs/{run}/provenance").json()
    assert provenance["request"]["model"]["spec"] == spec
    assert provenance["operating_snapshot"]["network"]["assignments"] == spec["assignments"]
    reopened = TestClient(create_app(run_root=tmp_path / "runs"))
    assert reopened.get("/portfolio").json()[0]["request"]["model"] == request["model"]
    again = reopened.post("/runs", json=request)
    assert again.status_code == 200 and again.json()["run_id"] == run
    changed = copy.deepcopy(request)
    changed["model"]["positions"] = {"R01": {"x": 1.0, "y": 2.0}}
    assert reopened.post("/runs", json=changed).json()["run_id"] == run
    preview = client.post("/models/preview", json=request)
    assert preview.status_code == 200, preview.text
    resolved = next(lane for lane in preview.json()["lanes"] if lane["target"] == "R01")
    assert resolved["lead_mean"] == 2.0 and resolved["lead_cv"] == 0.0
    assert preview.json()["network"]["edges"] == {**network["edges"], "flow_units": [0.0] * 5}
    with np.load(tmp_path / "runs" / run / "arrays.npz") as arrays:
        assert np.isfinite(arrays["on_hand"]).all()
    changed = copy.deepcopy(request)
    changed["model"]["spec"]["dcs"][0]["daily_capacity"] = 123.0
    updated = client.put(
        f"/portfolio/{saved.json()['id']}",
        json={
            "name": "Revised model",
            "notes": "ASSUMPTION: capacity sensitivity",
            "request": changed,
            "revision": 1,
        },
    )
    assert updated.status_code == 200
    revisions = client.get(f"/portfolio/{saved.json()['id']}/revisions").json()
    assert [row["revision"] for row in revisions] == [2, 1]
    assert revisions[1]["request"]["model"] == request["model"]
    assert (
        client.put(
            f"/portfolio/{saved.json()['id']}", json={**updated.json(), "revision": 1}
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/portfolio/{saved.json()['id']}",
            json={"name": "Stale", "request": request, "revision": 1},
        ).status_code
        == 409
    )
    revised_run = client.post("/runs", json=changed).json()["run_id"]
    assert client.get("/compare", params={"a": run, "b": revised_run}).status_code == 200
    different_master = copy.deepcopy(request)
    different_master["model"]["spec"]["customers"] = spec["customers"][:1]
    different_master["model"]["spec"]["assignments"].pop("R02")
    different_run = client.post("/runs", json=different_master).json()["run_id"]
    incompatible = client.get("/compare", params={"a": run, "b": different_run})
    assert incompatible.status_code == 409 and "identities" in incompatible.json()["detail"]


@pytest.mark.parametrize(
    "invalid",
    [
        "dangling",
        "cycle",
        "duplicate",
        "closed",
        "count",
        "version",
        "region",
        "lane",
        "budget",
        "edge_identity",
    ],
)
def test_custom_models_reject_invalid_structure_and_limits(tmp_path: Path, invalid: str) -> None:
    client = TestClient(create_app(run_root=tmp_path))
    request = client.get("/models/catalog").json()["request"]
    spec = request["model"]["spec"]
    if invalid == "dangling":
        spec["skus"][0]["supplier"] = "missing"
    elif invalid == "cycle":
        spec["lanes"] = [{"source": "R01", "target": "S1"}]
    elif invalid == "duplicate":
        spec["customers"][0]["id"] = "S1"
    elif invalid == "closed":
        spec["open_dcs"] = ["DC1"]
        spec["assignments"] = {"R01": "DC2"}
    elif invalid == "count":
        spec["open_dcs"] = ["DC1"]
        request["overrides"]["network"] = {"dc_count": 4}
    elif invalid == "version":
        request["model"]["format_version"] = 9
    elif invalid == "region":
        spec["customers"][0]["region"] = 999
    elif invalid == "lane":
        spec["lanes"] = [{"source": "S1", "target": "DC1", "lead_mean": -1.0}]
    elif invalid == "budget":
        spec["skus"] = [{**spec["skus"][0], "id": f"SKU{i}"} for i in range(100)]
        request["overrides"]["horizon_days"] = 730
    elif invalid == "edge_identity":
        spec["suppliers"] = [{**spec["suppliers"][0], "id": identity} for identity in ("S", "S_A")]
        spec["dcs"] = [{**spec["dcs"][0], "id": identity} for identity in ("A_B", "B")]
        for sku in spec["skus"]:
            sku["supplier"] = "S"
    response = client.post("/models/preview", json=request)
    assert response.status_code == 422, response.text
    assert not list(tmp_path.glob("*/status.json"))


def test_builder_fixture_and_canonical_reference_match() -> None:
    client = TestClient(create_app())
    assert client.get("/models/catalog").json() == json.loads(
        Path("web/src/fixtures/builder.json").read_text()
    )


def test_snapshot_defaults_use_custom_master_instead_of_reference_supplier_ids(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(run_root=tmp_path))
    request = client.get("/models/catalog").json()["request"]
    spec = request["model"]["spec"]
    spec["suppliers"] = [{**spec["suppliers"][0], "id": "PrimarySource"}]
    spec["dcs"] = spec["dcs"][:1]
    for sku in spec["skus"]:
        sku["supplier"] = "PrimarySource"
    response = client.post("/models/preview", json=request)
    assert response.status_code == 200, response.text
    assert response.json()["open_dcs"] == ["DC1"]
