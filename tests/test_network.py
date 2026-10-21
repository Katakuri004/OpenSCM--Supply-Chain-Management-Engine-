from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError
from scm.config.loader import load_study
from scm.network.builder import build_network
from scm.network.facility_location import k_median
from scm.network.geography import haversine_km
from scm.network.inputs import network_inputs
from scm.policies.ordering import order_quantity
from scm.sim.multi_echelon import allocate_fifo, simulate_network
from scm.sim.transport import freight


def test_haversine_and_weighted_selection() -> None:
    distance = haversine_km([[0, 0], [0, 1]], [[0, 0], [0, 1]])
    assert distance[0, 0] == 0
    assert distance[0, 1] == pytest.approx(111.19492664)
    np.testing.assert_allclose(distance, distance.T)
    costs = np.array([[0, 10, 20], [10, 0, 10], [20, 10, 0]], dtype=float)
    np.testing.assert_array_equal(k_median(costs, [10, 1, 1], 1), [0])
    chosen = k_median(costs, [1, 1, 1], 2)
    assert np.min(costs[chosen], axis=0).sum() == 10


@pytest.mark.parametrize(
    "kind,day,expected",
    [
        ("QR", 0, [0, 12, 24]),
        ("sS", 0, [0, 24, 36]),
        ("RS", 0, [24, 24, 36]),
        ("RS", 1, [0, 0, 0]),
        ("order_up_to", 1, [24, 24, 36]),
    ],
)
def test_policies_and_pack_rounding(kind: str, day: int, expected: list[int]) -> None:
    # Effective Q = MOQ 10 rounded to a pack of 6 => 12. Equality at R does not trigger.
    actual = order_quantity([10, 9, -5], kind, 8, 10, 30, 7, day, 10, 6)
    np.testing.assert_array_equal(actual, expected)


def test_transport_chooses_full_trucks_and_ltl_remainder() -> None:
    cost, trips, ltl = freight([0, 20, 250], [10, 10, 10], 1, 100, 500)
    np.testing.assert_allclose(cost, [0, 200, 1500])
    np.testing.assert_allclose(trips, [0, 0, 2])  # Equal-cost residual uses LTL deterministically.
    np.testing.assert_allclose(ltl, [0, 20, 50])


def test_config_and_all_dc_counts() -> None:
    study = load_study()
    assert len(study.spec.skus) == 20
    assert len(study.spec.customers) == 28
    for count in (1, 2, 4, 8):
        scenario = study.scenario.model_copy(deep=True)
        scenario.network.dc_count = count
        network = build_network(study.spec, scenario)
        assert np.count_nonzero(network.is_dc) == count
        assert np.count_nonzero(network.is_supplier) == 4
        assert len(network.customer_indices) == 28
        assert np.all(network.parent[:, ~network.is_supplier] >= 0)
        assert network.as_contract("test").nodes.id == network.node_ids


def test_capacity_fifo_and_network_balances() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    net.initial_stock[:, net.is_dc] = 4
    net.quantity[:] = 4
    net.reorder[:] = 0
    net.moq[:] = 1
    net.pack[:] = 1
    net.capacity[:] = 1
    usage = np.zeros((12, 20, 28))
    usage[0, :, 0] = 4
    usage[1, :, 1] = 4
    usage[2, :, 0] = 4
    leads = np.ones((12, len(net.source)), dtype=np.int64)
    result = simulate_network(net, usage, leads, warmup_days=0)
    np.testing.assert_allclose(
        net.initial_stock
        + np.cumsum(
            result.received + result.produced - result.dispatched - result.fulfilled, axis=0
        ),
        result.on_hand,
        atol=1e-8,
    )
    np.testing.assert_allclose(
        np.cumsum(result.orders - result.received, axis=0), result.on_order, atol=1e-8
    )
    np.testing.assert_allclose(
        np.cumsum(result.edge_shipped - result.edge_received, axis=0), result.in_transit, atol=1e-8
    )
    np.testing.assert_allclose(
        result.on_order.sum(axis=2),
        result.in_transit.sum(axis=2) + result.pending.sum(axis=2),
        atol=1e-8,
    )
    leaf = net.customer_indices
    np.testing.assert_allclose(
        np.cumsum(usage - result.fulfilled[:, :, leaf], axis=0),
        result.customer_backorders[:, :, leaf],
        atol=1e-8,
    )
    assert np.all(result.on_hand >= -1e-10)
    assert np.all(result.dispatched.sum(axis=1) <= net.capacity + 1e-8)
    np.testing.assert_allclose(result.total_cost, sum(result.costs.values()))


def test_fifo_stock_and_shared_capacity() -> None:
    # Requests are chronological; an unavailable SKU must not block a different SKU.
    allocated = allocate_fifo(
        np.array([4.0, 4.0, 100.0]),
        np.array([0, 0, 0]),
        np.array([0, 1, 0]),
        np.array([[2.0, 9.0]]),
        np.array([5.0]),
    )
    np.testing.assert_allclose(allocated, [2, 3, 0])


def test_scenario_rejects_unknown_supplier(tmp_path: Path) -> None:
    scenario = tmp_path / "invalid.yaml"
    scenario.write_text("scenario: bad\nnetwork: {dc_count: 4, suppliers: [missing]}\n")
    with pytest.raises(ValueError, match="supplier"):
        load_study(scenario)


def test_invalid_inputs_are_rejected() -> None:
    with pytest.raises(ValueError):
        haversine_km([[91, 0]], [[0, 0]])
    with pytest.raises(ValueError):
        k_median([[1]], [1], 2)
    with pytest.raises(ValueError):
        order_quantity([0], "unknown", 10, 5, 20, 1, 0, 1, 1)
    study = load_study()
    with pytest.raises(ValidationError):
        type(study.spec).model_validate({**study.spec.model_dump(), "skus": []})


def test_network_common_random_numbers() -> None:
    study = load_study()
    small = build_network(study.spec, study.scenario)
    scenario = study.scenario.model_copy(deep=True)
    scenario.network.dc_count = 8
    large = build_network(study.spec, scenario)
    demand_a, leads_a = network_inputs(small, study.seasonality, 123, 12)
    demand_b, leads_b = network_inputs(large, study.seasonality, 123, 12)
    np.testing.assert_array_equal(demand_a, demand_b)
    _, ia, ib = np.intersect1d(small.canonical_edge, large.canonical_edge, return_indices=True)
    np.testing.assert_array_equal(leads_a[:, ia], leads_b[:, ib])
    first = simulate_network(small, demand_a, leads_a)
    second = simulate_network(small, *network_inputs(small, study.seasonality, 123, 12))
    np.testing.assert_array_equal(first.total_cost, second.total_cost)
    np.testing.assert_array_equal(first.on_hand, second.on_hand)


@pytest.mark.parametrize("kind", ["QR", "sS", "RS", "order_up_to"])
def test_network_policies_receive_replenishments(kind: str) -> None:
    study = load_study()
    scenario = type(study.scenario).model_validate(
        {
            **study.scenario.model_dump(),
            "policy": {**study.scenario.policy.model_dump(), "default": kind},
        }
    )
    net = build_network(study.spec, scenario)
    usage, leads = network_inputs(net, study.seasonality, 20, 40)
    result = simulate_network(net, usage, leads, warmup_days=10)
    assert result.received.sum() > 0
    assert result.produced.sum() > 0
    assert np.min(result.on_hand) > -1e-7
    np.testing.assert_allclose(
        net.initial_stock
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
    np.testing.assert_allclose(result.orders / net.pack, np.round(result.orders / net.pack))
    if kind == "RS":
        assert not result.orders[np.arange(40) % net.spec.inventory.review_days != 0].any()


def test_network_lost_sales_and_late_shipments() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    usage = np.ones((3, 20, 28))
    leads = np.full((3, len(net.source)), 100)
    result = simulate_network(net, usage, leads, lost_sales=True)
    assert not result.customer_backorders.any()
    assert not result.received.any()
    assert result.in_transit[-1].sum() > 0
    np.testing.assert_array_equal(result.lost[:, :, net.customer_indices], usage)
    with pytest.raises(ValueError, match="lead_times"):
        simulate_network(net, usage, leads * 0)
    with pytest.raises(ValueError, match="warmup_days"):
        simulate_network(net, usage, leads, warmup_days=3)


def test_fifo_order_age_and_partial_dispatch_timing() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    net.initial_stock[:, net.is_dc] = 100
    net.reorder[:] = 0
    net.quantity[:] = 1
    net.moq[:] = net.pack[:] = 1
    net.capacity[:] = 2
    usage = np.zeros((5, 20, 28))
    usage[0, 0, 0] = 3
    usage[1, 0, 1] = 2
    leads = np.ones((5, len(net.source)), dtype=int)
    leads[1, net.edge_for[0, net.customer_indices[0]]] = 10
    result = simulate_network(net, usage, leads)
    first, second = net.customer_indices[:2]
    assert net.parent[0, first] == net.parent[0, second]
    np.testing.assert_array_equal(result.received[:, 0, first], [0, 2, 1, 0, 0])
    np.testing.assert_array_equal(result.received[:, 0, second], [0, 0, 1, 1, 0])
    assert result.costs["shortage"][0, first] == 3 * net.shortage_penalty[first]


def test_full_horizon_network_balances() -> None:
    study = load_study()
    study.scenario.network.dc_count = 8
    net = build_network(study.spec, study.scenario)
    seed = int(np.random.SeedSequence(303).spawn(1)[0].generate_state(1)[0])
    usage, leads = network_inputs(net, study.seasonality, seed, 455)
    result = simulate_network(net, usage, leads, warmup_days=90)
    assert np.min(result.on_hand) >= 0
    np.testing.assert_allclose(
        net.initial_stock
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


def test_network_costs_on_a_hand_calculated_supplier_dc_retailer_lane() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = net.reorder[:] = 0
    net.quantity[:] = net.moq[:] = net.pack[:] = 1
    net.capacity[:] = 100
    net.fixed_cost[:] = net.holding_rate[:] = 0
    net.order_cost[:] = 2
    net.order_cost[net.is_dc] = 10
    net.unit_cost[:] = 10
    net.shortage_penalty[:] = 3
    net.handling_cost[:] = 0
    net.handling_cost[net.is_dc] = 0.5
    net.spec.transport.ltl_per_unit_km = 0
    usage = np.zeros((3, 20, 28))
    usage[0, 0, 0] = 3
    result = simulate_network(net, usage, np.ones((3, len(net.source)), dtype=int))
    assert result.produced[0].sum() == 3
    assert result.received[1].sum() == result.received[2].sum() == 3
    assert result.fulfilled[2].sum() == 3
    assert result.costs["purchase"].sum() == 30
    assert result.costs["ordering"].sum() == 36  # Three Q lots at each stocking echelon.
    assert result.costs["shortage"].sum() == 9  # Charged once, on the original shortfall.
    assert result.costs["handling"].sum() == 1.5
    assert result.total_cost.sum() == 76.5


def test_vectorized_fifo_matches_chronological_reference() -> None:
    rng = np.random.default_rng(np.random.SeedSequence(456))
    for _ in range(20):
        requests = rng.integers(0, 20, 40).astype(float)
        source, sku = rng.integers(0, 3, (2, 40))
        stock = rng.integers(0, 50, (3, 3)).astype(float)
        capacity = rng.integers(0, 100, 3).astype(float)
        actual = allocate_fifo(requests, source, sku, stock, capacity)
        expected = np.zeros_like(requests)
        for i in range(len(requests)):
            expected[i] = min(requests[i], stock[source[i], sku[i]], capacity[source[i]])
            stock[source[i], sku[i]] -= expected[i]
            capacity[source[i]] -= expected[i]
        np.testing.assert_array_equal(actual, expected)


def test_outbound_freight_consolidates_skus_on_the_same_lane() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    net.initial_stock[:, net.is_dc] = 100
    net.quantity[:] = net.moq[:] = net.pack[:] = 1
    net.reorder[:] = 0
    net.capacity[:] = 1000
    net.spec.transport.ltl_per_unit_km = 1
    net.spec.transport.ftl_capacity = 100
    net.spec.transport.ftl_fixed_cost = 500
    net.spec.transport.ftl_per_km = 0
    net.distance[:] = 10
    usage = np.zeros((1, 20, 28))
    usage[0, :2, 0] = 30
    result = simulate_network(net, usage, np.ones((1, len(net.source)), dtype=int))
    edge = net.edge_for[0, net.customer_indices[0]]
    assert result.edge_shipped[0, :, edge].sum() == 60
    assert result.ftl_trips[0, edge] == 1
    assert result.ltl_units[0, edge] == 0
    assert result.costs["outbound_freight"][0, net.customer_indices[0]] == 500
