import numpy as np
from scm.config.loader import load_study
from scm.config.mitigation import MitigationSettings
from scm.contracts import Disruption
from scm.network.builder import build_network
from scm.sim.multi_echelon import simulate_network


def test_backup_supplier_conserves_orders_and_respects_capacity() -> None:
    study = load_study()
    study.scenario.disruptions = [
        Disruption(type="supplier_outage", target="S4", start_day=0, duration=10, magnitude=1.0)
    ]
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    usage = np.ones((10, 20, 28))
    leads = np.ones((10, len(net.source)), dtype=np.int64)
    result = simulate_network(
        net, usage, leads, mitigation=MitigationSettings(backup_suppliers={"S4": "S1"})
    )
    assert not result.dispatched[:, :, 3].any()
    s4_skus = np.array([s.supplier == "S4" for s in net.spec.skus])
    assert result.dispatched[:, s4_skus, 0].sum() > 0
    assert np.all(result.dispatched.sum(axis=1) <= net.capacity + 1e-7)
    supplier_prices = {s.id: s.price_multiplier for s in study.spec.suppliers}
    incoming = net.is_supplier[net.source]
    actual_cost = np.array([s.unit_cost for s in study.spec.skus])[:, None] * np.array(
        [supplier_prices[net.node_ids[i]] for i in net.source[incoming]]
    )
    np.testing.assert_allclose(
        result.costs["purchase"].sum(),
        (result.edge_shipped[:, :, incoming] * actual_cost[None]).sum(),
    )
    np.testing.assert_allclose(
        result.on_order.sum(axis=2),
        result.pending.sum(axis=2) + result.in_transit.sum(axis=2),
        atol=1e-7,
    )
    assert result.initial_stock is not None
    np.testing.assert_allclose(
        result.initial_stock
        + np.cumsum(
            result.received + result.produced - result.dispatched - result.fulfilled, axis=0
        ),
        result.on_hand,
        atol=1e-7,
    )


def test_stock_buffer_and_expedite_are_charged_and_shorten_transit() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    usage = np.ones((6, 20, 28))
    leads = np.full((6, len(net.source)), 4, dtype=np.int64)
    baseline = simulate_network(net, usage, leads)
    buffered = simulate_network(net, usage, leads, mitigation=MitigationSettings(buffer_days=2))
    assert buffered.initial_stock is not None and baseline.initial_stock is not None
    assert buffered.initial_stock.sum() > baseline.initial_stock.sum()
    net.initial_stock[:] = 0
    fast = simulate_network(
        net, usage, leads, mitigation=MitigationSettings(expedite_factor=0.5, expedite_unit_cost=10)
    )
    assert fast.received[2].sum() > 0
    assert (
        fast.costs["inbound_freight"].sum()
        >= fast.edge_shipped[:, :, net.is_supplier[net.source]].sum() * 10
    )
