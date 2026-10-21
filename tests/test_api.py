from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(run_root=tmp_path / "runs"))


def request(seed: int = 42, replications: int = 1) -> dict[str, object]:
    return {
        "preset": "base_4dc",
        "seed": seed,
        "replications": replications,
        "overrides": {"warmup_days": 7, "horizon_days": 21},
    }


def test_run_cache_network_health_and_series(client: TestClient) -> None:
    assert "base_4dc" in client.get("/scenarios").json()["presets"]
    created = client.post("/runs", json=request())
    assert created.status_code == 201, created.text
    run_id = created.json()["run_id"]
    assert created.json()["status"] == "complete"
    cached = client.post("/runs", json=request())
    assert cached.status_code == 200 and cached.json()["run_id"] == run_id
    equivalent = request()
    equivalent["overrides"] = {"warmup_days": 7, "horizon_days": 21, "network": {"dc_count": 4}}
    assert client.post("/runs", json=equivalent).json()["run_id"] == run_id
    network = client.get(f"/runs/{run_id}/network").json()
    assert len(network["network"]["nodes"]["id"]) == 36
    health = client.get(f"/runs/{run_id}/health").json()
    assert len(health["days"]) == 28
    assert len(health["stockout"]) == 36
    assert all(len(row) == 28 for row in health["days_of_cover"])
    series = client.get(
        f"/runs/{run_id}/timeseries",
        params={
            "node": "R01",
            "sku": "SKU01",
            "metrics": ["on_hand", "fill_rate"],
            "start_day": 7,
            "end_day": 10,
        },
    )
    assert series.status_code == 200, series.text
    assert series.json()["days"] == [7, 8, 9, 10]
    assert set(series.json()["metrics"]) == {"on_hand", "fill_rate"}
    assert (
        client.get(
            f"/runs/{run_id}/timeseries", params={"node": "missing", "sku": "SKU01"}
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/runs/{run_id}/timeseries",
            params={"node": "R01", "sku": "SKU01", "start_day": 10, "end_day": 7},
        ).status_code
        == 422
    )


def test_background_runs_and_paired_comparison(client: TestClient) -> None:
    a = client.post("/runs", json=request(replications=2))
    assert a.status_code == 202, a.text
    run_a = a.json()["run_id"]
    assert client.get(f"/runs/{run_a}").json()["status"] == "complete"
    body = request(replications=2)
    body["overrides"] = {"warmup_days": 7, "horizon_days": 21, "network": {"dc_count": 2}}
    b = client.post("/runs", json=body)
    run_b = b.json()["run_id"]
    result = client.get("/compare", params={"a": run_a, "b": run_b})
    assert result.status_code == 200, result.text
    assert result.json()["replications"] == 2
    assert len(result.json()["costs"]["component"]) == 8
    assert sum(result.json()["costs"]["delta"]) == pytest.approx(
        result.json()["metrics"]["total_landed_cost_inr"]["mean"]
    )
    same = client.get("/compare", params={"a": run_a, "b": run_a}).json()
    assert same["metrics"]["total_landed_cost_inr"]["mean"] == 0
    assert same["metrics"]["total_landed_cost_inr"]["ci95"] == [0, 0]
    c = client.post("/runs", json=request(seed=43, replications=2)).json()["run_id"]
    assert client.get("/compare", params={"a": run_a, "b": c}).status_code == 409


def test_query_matches_health_and_rejects_injection(client: TestClient) -> None:
    run_id = client.post("/runs", json=request()).json()["run_id"]
    body = {"text": "retailers with fill rate < 95%", "day": 20}
    response = client.post(f"/runs/{run_id}/query", json=body)
    assert response.status_code == 200, response.text
    assert all(v < 0.95 for v in response.json()["values"])
    assert all(kind == "retailer" for kind in response.json()["node_types"])
    cover = client.post(
        f"/runs/{run_id}/query",
        json={
            "day": 20,
            "filter": {"node_type": "dc", "metric": "days_of_cover", "operator": "lt", "value": 7},
        },
    ).json()
    health = client.get(f"/runs/{run_id}/health").json()
    expected = sorted(
        node
        for i, node in enumerate(health["node_ids"])
        if node.startswith("DC")
        and health["days_of_cover"][i][20] is not None
        and health["days_of_cover"][i][20] < 7
    )
    assert cover["node_ids"] == expected
    assert (
        client.post(
            f"/runs/{run_id}/query", json={"text": "nodes with on_hand < 0; DROP TABLE nodes"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/runs/{run_id}/query",
            json={"filter": {"metric": "on_hand; DELETE", "operator": "lt", "value": 1}},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/runs/{run_id}/query",
            json={
                "text": body["text"],
                "filter": {"metric": "on_hand", "operator": "gt", "value": 0},
            },
        ).status_code
        == 422
    )


def test_errors_experiment_pagination_and_resource_bounds(client: TestClient) -> None:
    assert client.get("/runs/not-a-hash/health").status_code == 404
    assert client.post("/runs", json={**request(), "preset": "../secret"}).status_code == 422
    assert client.post("/runs", json={**request(), "replications": 10000}).status_code == 422
    assert (
        client.post("/runs", json={**request(), "overrides": {"horizon_days": 100000}}).status_code
        == 422
    )
    data = client.get("/experiments/E2", params={"limit": 3, "offset": 1})
    assert data.status_code == 200, data.text
    assert data.json()["total"] == 144
    assert len(data.json()["metric"]) == 3
    assert len(data.json()["value"]) == 3
    assert client.get("/experiments/unknown").status_code == 422


def test_forecast_modes_are_explicit_and_change_cache_identity(client: TestClient) -> None:
    run_ids = set()
    for options in ({}, {"forecasting": True}, {"segmented": True}, {"bullwhip": True}):
        response = client.post("/runs", json={**request(), "options": options})
        assert response.status_code == 201, response.text
        run_ids.add(response.json()["run_id"])
    assert len(run_ids) == 4
    invalid = client.post(
        "/runs", json={**request(), "options": {"segmented": True, "bullwhip": True}}
    )
    assert invalid.status_code == 422
    response = client.get(f"/runs/{next(iter(run_ids))}/kpis", params={"node": "missing"})
    assert response.status_code == 404


def test_experiment_manifest_protects_evidence_integrity(tmp_path: Path) -> None:
    import shutil

    root = tmp_path / "experiments"
    (root / "E2").mkdir(parents=True)
    for name in ("results.parquet", "manifest.json"):
        shutil.copyfile(Path("docs/evidence/m7/E2") / name, root / "E2" / name)
    with TestClient(create_app(run_root=tmp_path / "runs", experiment_root=root)) as session:
        assert session.get("/experiments/E2").status_code == 200
        (root / "E2/results.parquet").write_bytes(b"invalid evidence")
        assert session.get("/experiments/E2").status_code == 409
