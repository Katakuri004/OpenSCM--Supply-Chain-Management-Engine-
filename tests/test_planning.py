import numpy as np
import pytest
from scm.config.loader import load_study
from scm.config.planning import load_planning
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.policies.ordering import order_quantity
from scm.policies.planning import ReplenishmentPlanner
from scm.sim.multi_echelon import simulate_network


def test_mixed_policy_ordering() -> None:
    actual = order_quantity([9, 9, 9, 9], ["QR", "sS", "RS", "order_up_to"], 8, 10, 30, 7, 1, 10, 6)
    np.testing.assert_array_equal(actual, [12, 24, 0, 24])


@pytest.mark.parametrize("segmented", [False, True])
def test_planning_is_causal_and_observes_orders_at_dcs(segmented: bool) -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    settings = load_planning()
    settings.segmented = segmented
    history, _ = network_inputs(net, study.seasonality, 440, 30)
    usage, leads = network_inputs(net, study.seasonality, 441, 20)
    original_q = net.quantity.copy()
    first = simulate_network(net, usage, leads, planning=settings, demand_history=history)
    changed = usage.copy()
    changed[10:] *= 10
    second = simulate_network(net, changed, leads, planning=settings, demand_history=history)
    assert first.forecast is not None and second.forecast is not None
    assert first.observed_demand is not None
    assert first.initial_stock is not None
    np.testing.assert_array_equal(first.forecast[:11], second.forecast[:11])
    np.testing.assert_array_equal(first.orders[:10], second.orders[:10])
    np.testing.assert_array_equal(net.quantity, original_q)
    np.testing.assert_array_equal(first.observed_demand[:, :, net.customer_indices], usage)
    expected = np.zeros_like(first.observed_demand)
    for day in range(len(usage)):
        np.add.at(
            expected[day],
            (np.arange(20)[:, None], net.parent[:, net.customer_indices]),
            first.orders[day][:, net.customer_indices],
        )
    np.testing.assert_array_equal(first.observed_demand[:, :, net.is_dc], expected[:, :, net.is_dc])
    np.testing.assert_allclose(
        first.initial_stock
        + np.cumsum(first.received + first.produced - first.dispatched - first.fulfilled, axis=0),
        first.on_hand,
        atol=1e-7,
    )
    np.testing.assert_allclose(
        first.on_order.sum(axis=2),
        first.pending.sum(axis=2) + first.in_transit.sum(axis=2),
        atol=1e-7,
    )
    repeat = simulate_network(net, usage, leads, planning=settings, demand_history=history)
    np.testing.assert_array_equal(first.total_cost, repeat.total_cost)


def test_b2b_service_floor_and_policy_mapping() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    settings = load_planning()
    settings.safety_factor_offset = -4
    history, _ = network_inputs(net, study.seasonality, 440, 30)
    planner = ReplenishmentPlanner(net, settings, history)
    assert planner.policy.shape == net.quantity.shape
    for sku, cell in enumerate(planner.segments.cell):
        assert np.all(planner.policy[sku] == settings.segmentation.cells[cell].policy)
    from scipy.special import ndtr

    for i, customer in enumerate(study.spec.customers):
        if customer.kind == "b2b":
            assert np.all(ndtr(planner.z[:, net.customer_indices[i]]) >= customer.target_csl)
    with pytest.raises(ValueError, match="history"):
        ReplenishmentPlanner(net, settings, history[:1])


def test_forecast_initialization_does_not_look_ahead_in_training() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    settings = load_planning()
    # Training observations are past data; zero-demand history must remain valid.
    planner = ReplenishmentPlanner(net, settings, np.zeros((3, 20, 28)))
    assert np.all(planner.segments.cell == "CZ")
    assert np.all(np.isfinite(planner.initial_stock))
    assert np.all(planner.initial_stock >= 0)


@pytest.mark.parametrize("policy", ["QR", "sS", "RS", "order_up_to"])
def test_constant_demand_targets_match_the_known_demand_engine(policy: str) -> None:
    study = load_study()
    scenario = type(study.scenario).model_validate(
        {
            **study.scenario.model_dump(),
            "policy": {**study.scenario.policy.model_dump(), "default": policy},
        }
    )
    scenario.demand.cv_scale = 0
    for customer in study.spec.customers:
        customer.arrival_probability = 1
    net = build_network(study.spec, scenario)
    history, _ = network_inputs(net, study.seasonality, 44, 20)
    settings = load_planning()
    settings.segmented = False
    planner = ReplenishmentPlanner(net, settings, history)
    q, reorder, upper = planner.targets(~net.is_supplier)
    np.testing.assert_allclose(q, net.quantity[:, ~net.is_supplier])
    np.testing.assert_allclose(reorder, net.reorder[:, ~net.is_supplier])
    np.testing.assert_allclose(upper, net.upper[:, ~net.is_supplier])


def test_all_nine_segments_select_their_configured_policy() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    settings = load_planning()
    value = np.array([1000.0] * 3 + [100.0] * 3 + [10.0] * 14)
    profiles = np.array([[1.0] * 8, [0.2, 1.8] * 4, [0.0, 0.0, 0.0, 4.0] * 2]).T
    # Exact means and CVs across eight past days, with distinct A/B/C value groups.
    quantity = profiles[:, np.arange(20) % 3] * (value / net.unit_cost)[None, :]
    history = np.repeat(quantity[:, :, None] / 28, 28, axis=2)
    planner = ReplenishmentPlanner(net, settings, history)
    assert set(planner.segments.cell) == set(settings.segmentation.cells)
    for sku, cell in enumerate(planner.segments.cell):
        assert np.all(planner.policy[sku] == settings.segmentation.cells[cell].policy)


def test_planning_requires_historical_observations() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    usage, leads = network_inputs(net, study.seasonality, 441, 2)
    with pytest.raises(ValueError, match="supplied together"):
        simulate_network(net, usage, leads, planning=load_planning())
    with pytest.raises(ValueError, match="supplied together"):
        simulate_network(net, usage, leads, demand_history=usage)
