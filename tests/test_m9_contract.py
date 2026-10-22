import json
from pathlib import Path

from fastapi.testclient import TestClient
from scm.contracts import Health, Kpis, RunNetwork, TimeSeries

from api.app.main import create_app


def test_network_exposes_nominal_policy_targets(tmp_path: Path) -> None:
    with TestClient(create_app(run_root=tmp_path)) as client:
        run = client.post("/runs", json={"overrides": {"warmup_days": 0, "horizon_days": 2}})
        response = client.get(f"/runs/{run.json()['run_id']}/network").json()
    policy = response["policy"]
    assert response["warmup_days"] == 0
    assert policy["basis"] == "nominal_initial_targets"
    assert len(policy["reorder_point"]) == len(response["sku_ids"])
    assert len(policy["reorder_point"][0]) == len(response["network"]["nodes"]["id"])
    assert policy["order_quantity"][0][8] > 0


def test_recorded_tower_payloads_validate_against_consumer_contracts() -> None:
    data = json.loads(Path("web/public/fixtures/tower.json").read_text(encoding="utf-8"))
    network = RunNetwork.model_validate(data["network"])
    health = Health.model_validate(data["health"])
    assert network.network.run_id == health.run_id == data["status"]["run_id"]
    assert network.network.nodes.id == health.node_ids
    for node in network.network.nodes.id:
        series = TimeSeries.model_validate(data["series"][node])
        kpis = Kpis.model_validate(data["kpis"][node])
        assert series.node_id == kpis.node_id == node
        assert series.run_id == kpis.run_id == health.run_id
