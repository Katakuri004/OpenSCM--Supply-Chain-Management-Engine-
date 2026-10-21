import json
import sys
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator
from pydantic import ValidationError
from scm.contracts import CONTRACTS, Health, Kpis, Network, Query, Scenario, TimeSeries
from scm.contracts import main as generate_contracts

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("name", CONTRACTS)
def test_fixture_matches_model_and_schema(name: str) -> None:
    schema = json.loads((ROOT / "contracts" / f"{name}.schema.json").read_text())
    fixture = json.loads((ROOT / "contracts/fixtures" / f"{name}.json").read_text())
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(fixture)
    CONTRACTS[name].model_validate(fixture)
    assert schema == CONTRACTS[name].model_json_schema()


def test_base_scenario_matches_fixture() -> None:
    scenario = Scenario.model_validate(yaml.safe_load((ROOT / "configs/base_4dc.yaml").read_text()))
    assert scenario == Scenario.model_validate_json(
        (ROOT / "contracts/fixtures/scenario.json").read_text()
    )
    assert scenario.horizon_days + scenario.warmup_days == 455


def test_disruption_scenario_fixture_matches_schema() -> None:
    fixture = json.loads((ROOT / "contracts/fixtures/scenario_disruption.json").read_text())
    schema = json.loads((ROOT / "contracts/scenario.schema.json").read_text())
    Draft202012Validator(schema).validate(fixture)
    assert Scenario.model_validate(fixture).disruptions[0].magnitude == 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"horizon_days": 0},
        {"warmup_days": -1},
        {"replications": 0},
        {"demand": {"regional_rho": 1.1}},
        {"policy": {"target_csl": 1}},
        {"network": {"dc_count": 3}},
        {"unknown": True},
        {"horizon_days": True},
    ],
)
def test_invalid_scenario_rejected(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Scenario.model_validate({"scenario": "invalid", **overrides})


def test_network_rejects_dangling_edges_and_duplicate_nodes() -> None:
    fixture = json.loads((ROOT / "contracts/fixtures/network.json").read_text())
    fixture["edges"]["target"][0] = "missing"
    with pytest.raises(ValidationError):
        Network.model_validate(fixture)
    fixture["edges"]["target"][0] = "DC1"
    fixture["nodes"]["id"][1] = fixture["nodes"]["id"][0]
    with pytest.raises(ValidationError):
        Network.model_validate(fixture)


@pytest.mark.parametrize("name,model", [("health", Health), ("timeseries", TimeSeries)])
def test_misaligned_columns_rejected(name: str, model: type[Health] | type[TimeSeries]) -> None:
    fixture = json.loads((ROOT / "contracts/fixtures" / f"{name}.json").read_text())
    fixture["days"].append(999)
    with pytest.raises(ValidationError):
        model.model_validate(fixture)


def test_query_only_accepts_supported_columns_and_operators() -> None:
    Query.model_validate({"metric": "fill_rate", "operator": "lt", "value": 0.95})
    for override in ({"metric": "arbitrary_sql"}, {"operator": "DROP TABLE"}):
        with pytest.raises(ValidationError):
            Query.model_validate(
                {"metric": "fill_rate", "operator": "lt", "value": 0.95, **override}
            )


@pytest.mark.parametrize("days", [[91, 90, 92], [90, 90, 91]])
def test_time_axis_is_unique_and_increasing(days: list[int]) -> None:
    fixture = json.loads((ROOT / "contracts/fixtures/timeseries.json").read_text())
    fixture["days"] = days
    with pytest.raises(ValidationError):
        TimeSeries.model_validate(fixture)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1.0])
def test_invalid_metric_value_rejected(value: float) -> None:
    with pytest.raises(ValidationError):
        Query(metric="on_hand", operator="lt", value=value)


@pytest.mark.parametrize(
    "estimate",
    [{"mean": 95.0}, {"mean": 0.95, "ci95": [0.9, 0.99]}, {"mean": None, "ci95": [0.9, 0.99]}],
)
def test_invalid_kpi_rejected(estimate: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Kpis.model_validate(
            {"run_id": "test", "replications": 1, "metrics": {"fill_rate": estimate}}
        )


def test_disruption_must_fit_simulation_window() -> None:
    event = {
        "type": "supplier_outage",
        "target": "S1",
        "start_day": 450,
        "duration": 5,
        "magnitude": 1.0,
    }
    Scenario.model_validate({"scenario": "test", "disruptions": [event]})
    with pytest.raises(ValidationError):
        Scenario.model_validate({"scenario": "test", "disruptions": [{**event, "duration": 6}]})


def test_fixture_references_match_across_payloads() -> None:
    network = Network.model_validate_json((ROOT / "contracts/fixtures/network.json").read_text())
    health = Health.model_validate_json((ROOT / "contracts/fixtures/health.json").read_text())
    series = TimeSeries.model_validate_json(
        (ROOT / "contracts/fixtures/timeseries.json").read_text()
    )
    kpis = Kpis.model_validate_json((ROOT / "contracts/fixtures/kpis.json").read_text())
    assert network.run_id == health.run_id == series.run_id == kpis.run_id
    assert set(health.node_ids).issubset(network.nodes.id)
    assert series.node_id in health.node_ids
    assert series.days == health.days


def test_schema_drift_check_does_not_rewrite_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["contracts"])
    generate_contracts()
    monkeypatch.setattr(sys, "argv", ["contracts", "--check"])
    generate_contracts()
    schema = tmp_path / "contracts/scenario.schema.json"
    schema.write_text("{}", encoding="utf-8")
    with pytest.raises(SystemExit, match="Stale contract"):
        generate_contracts()
    assert schema.read_text(encoding="utf-8") == "{}"
