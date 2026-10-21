import numpy as np
import pytest
from pydantic import ValidationError
from scm.config.loader import load_study
from scm.contracts import Disruption
from scm.network.builder import build_network
from scm.sim.disruptions import compile_disruptions
from scm.sim.multi_echelon import simulate_network


def event(
    kind: str, target: str, magnitude: float, start: int = 1, duration: int = 2
) -> Disruption:
    return Disruption.model_validate(
        dict(type=kind, target=target, magnitude=magnitude, start_day=start, duration=duration)
    )


def test_calendar_targets_overlap_and_exclusive_end() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    dc = int(np.flatnonzero(net.is_dc)[0])
    leaf = int(net.customer_indices[0])
    lane = net.as_contract("test").edges.id[0]
    net.scenario.disruptions = [
        event("supplier_outage", "S1", 1),
        event("capacity_cut", net.node_ids[dc], 0.5),
        event("capacity_cut", net.node_ids[dc], 0.5, start=2),
        event("demand_shock", net.node_ids[leaf], 2),
        event("lead_time_multiplier", lane, 3),
        event("moq_change", "S1", 4),
        event("price_promo", "S1", 0.2),
    ]
    schedule = compile_disruptions(net, 5)
    np.testing.assert_array_equal(schedule.capacity[:, 0], [1, 0, 0, 1, 1])
    np.testing.assert_array_equal(schedule.capacity[:, dc], [1, 0.5, 0.25, 0.5, 1])
    np.testing.assert_array_equal(schedule.demand[:, 0], [1, 2, 2, 1, 1])
    np.testing.assert_array_equal(schedule.lead[:, 0], [1, 3, 3, 1, 1])
    selected = (net.parent == 0) & net.is_dc[None, :]
    np.testing.assert_array_equal(schedule.moq[1][selected], 4)
    np.testing.assert_array_equal(schedule.moq[1][~selected], 1)
    np.testing.assert_array_equal(schedule.price[1, net.source == 0], 0.8)


@pytest.mark.parametrize(
    "kind,magnitude",
    [
        ("supplier_outage", 1.1),
        ("capacity_cut", 2),
        ("price_promo", 1.1),
        ("lead_time_multiplier", 0),
        ("moq_change", 0),
    ],
)
def test_magnitude_semantics_rejected_at_contract_boundary(kind: str, magnitude: float) -> None:
    with pytest.raises(ValidationError):
        event(kind, "S1", magnitude)


@pytest.mark.parametrize(
    "kind,target",
    [
        ("supplier_outage", "R01"),
        ("demand_shock", "S1"),
        ("price_promo", "R01"),
        ("capacity_cut", "missing"),
    ],
)
def test_unknown_or_incompatible_targets_rejected(kind: str, target: str) -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    net.scenario.disruptions = [event(kind, target, 1)]
    with pytest.raises(ValueError, match="target"):
        compile_disruptions(net, 5)


def test_events_change_physical_flows_without_mutating_inputs() -> None:
    study = load_study()
    study.scenario.policy.default = "order_up_to"
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    net.upper[:] = 10
    net.reorder[:] = 0
    net.moq[:] = net.pack[:] = 1
    usage = np.ones((8, 20, 28))
    leads = np.ones((8, len(net.source)), dtype=np.int64)
    baseline = simulate_network(net, usage, leads)
    leaf = net.node_ids[net.customer_indices[0]]
    net.scenario.disruptions = [
        event("supplier_outage", "S1", 1, start=0),
        event("demand_shock", leaf, 2),
        event("price_promo", "S2", 0.25, start=0),
    ]
    result = simulate_network(net, usage, leads)
    assert not result.dispatched[:2, :, 0].any()
    assert result.dispatched[2, :, 0].sum() > 0
    np.testing.assert_array_equal(result.demand[1:3, :, 0], 2)
    inbound = net.source == net.node_ids.index("S2")
    original_cost = (baseline.edge_shipped[0, :, inbound].T * net.unit_cost[:, None]).sum()
    assert result.costs["purchase"][0].sum() == pytest.approx(
        baseline.costs["purchase"][0].sum()
        - (baseline.edge_shipped[0, :, net.source == 0].T * net.unit_cost[:, None]).sum()
        - 0.25 * original_cost
    )
    np.testing.assert_array_equal(usage, 1)
    np.testing.assert_array_equal(leads, 1)
    assert result.initial_stock is not None
    np.testing.assert_allclose(
        result.initial_stock
        + np.cumsum(
            result.received + result.produced - result.dispatched - result.fulfilled, axis=0
        ),
        result.on_hand,
        atol=1e-7,
    )
    np.testing.assert_allclose(
        result.on_order.sum(axis=2),
        result.in_transit.sum(axis=2) + result.pending.sum(axis=2),
        atol=1e-7,
    )
    repeated = simulate_network(net, usage, leads)
    np.testing.assert_array_equal(repeated.total_cost, result.total_cost)


def test_lead_events_use_order_day_and_moq_applies_only_during_event() -> None:
    study = load_study()
    study.scenario.policy.default = "order_up_to"
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    net.reorder[:] = 0
    net.upper[:] = 10
    net.upper[:, net.is_dc] = 10000
    net.moq[:] = net.pack[:] = 1
    net.capacity[:] = 1e8
    leaf = int(net.customer_indices[0])
    lane = net.as_contract("test").edges.id[int(net.edge_for[0, leaf])]
    net.scenario.disruptions = [
        event("lead_time_multiplier", lane, 3, start=1, duration=1),
        event("moq_change", net.node_ids[leaf], 50, start=1, duration=1),
    ]
    usage = np.ones((8, 20, 28))
    leads = np.ones((8, len(net.source)), dtype=np.int64)
    result = simulate_network(net, usage, leads)
    assert result.orders[0, 0, leaf] == 11
    assert result.orders[1, 0, leaf] == 50
    assert result.received[2, 0, leaf] == 11  # Day-zero order dispatches on day one.
    assert result.received[4, 0, leaf] == 50  # Day-one order retains its extended transit.


def test_disruption_fixture_loads_and_scopes_supplier_skus() -> None:
    from pathlib import Path

    from scm.contracts import Scenario
    from scm.sim.disruptions import affected_customers

    study = load_study()
    scenario = Scenario.model_validate_json(
        Path("contracts/fixtures/scenario_disruption.json").read_text()
    )
    net = build_network(study.spec, scenario)
    scope = affected_customers(net, "S1")
    np.testing.assert_array_equal(scope.any(axis=1), [s.supplier == "S1" for s in net.spec.skus])
    compile_disruptions(net, 455)


def test_lost_sales_and_forecast_bullwhip_events() -> None:
    from scm.config.bullwhip import load_bullwhip
    from scm.config.planning import load_planning
    from scm.metrics.resilience import paired_resilience

    study = load_study()
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    net.capacity[:] = 0
    usage = np.ones((10, 20, 28))
    leads = np.ones((10, len(net.source)), dtype=np.int64)
    baseline = simulate_network(net, usage, leads, lost_sales=True)
    shock = event("demand_shock", net.node_ids[net.customer_indices[0]], 2, start=1)
    net.scenario.disruptions = [shock]
    disrupted = simulate_network(net, usage, leads, lost_sales=True)
    metrics = paired_resilience(net, disrupted, baseline, shock, window=7, tolerance=0.01)
    assert metrics["extra_lost_sales_units"] == 40
    assert not disrupted.customer_backorders.any()
    net.scenario.disruptions.append(event("moq_change", "S1", 3))
    planning = load_planning()
    planning.segmented = False
    result = simulate_network(
        net, usage, leads, planning=planning, demand_history=usage, bullwhip=load_bullwhip()
    )
    assert result.observed_demand is not None
    np.testing.assert_array_equal(result.observed_demand[:, :, net.customer_indices], result.demand)
    net.scenario.disruptions = [event("demand_shock", "R01", 2, start=9)]
    with pytest.raises(ValueError, match="beyond"):
        simulate_network(net, usage, leads)
