import numpy as np
import pytest
from scm.config.bullwhip import load_bullwhip
from scm.config.loader import load_study
from scm.config.planning import load_planning
from scm.contracts import BullwhipConfig
from scm.metrics.bullwhip import echelon_series
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.multi_echelon import simulate_network


def test_pos_sharing_changes_dc_signal_without_changing_physical_demand() -> None:
    study = load_study()
    study.scenario.bullwhip.pos_sharing = True
    net = build_network(study.spec, study.scenario)
    settings, planning = load_bullwhip(), load_planning()
    planning.segmented = False
    history, _ = network_inputs(net, study.seasonality, 550, 30)
    usage, leads = network_inputs(net, study.seasonality, 551, 21)
    result = simulate_network(
        net, usage, leads, bullwhip=settings, planning=planning, demand_history=history
    )
    assert result.observed_demand is not None and result.initial_stock is not None
    assert result.supply_fill is not None
    expected = np.zeros_like(result.observed_demand)
    for day in range(len(usage)):
        np.add.at(
            expected[day], (np.arange(20)[:, None], net.parent[:, net.customer_indices]), usage[day]
        )
    np.testing.assert_array_equal(
        result.observed_demand[:, :, net.is_dc], expected[:, :, net.is_dc]
    )
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
    assert np.all((result.supply_fill >= 0) & (result.supply_fill <= 1))
    series = echelon_series(net, result)
    np.testing.assert_array_equal(series["dc_orders"], series["supplier_orders_received"])
    changed = usage.copy()
    changed[10:] *= 5
    second = simulate_network(
        net, changed, leads, bullwhip=settings, planning=planning, demand_history=history
    )
    np.testing.assert_array_equal(result.orders[:10], second.orders[:10])


def test_lead_reduction_and_promotional_purchase_cost() -> None:
    study = load_study()
    study.scenario.bullwhip = BullwhipConfig(signal_processing=False, batching=False, price=True)
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    settings = load_bullwhip()
    settings.forward_buy_days = 0
    usage = np.ones((7, 20, 28))
    leads = np.full((7, len(net.source)), 3)
    original = simulate_network(net, usage, leads, bullwhip=settings)
    settings.lead_time_factor = 0.5
    reduced = simulate_network(net, usage, leads, bullwhip=settings)
    assert not original.received[:3].any()
    assert reduced.received[2].sum() > 0
    inbound = net.is_supplier[net.source]
    expected = (reduced.edge_shipped[0][:, inbound] * net.unit_cost[:, None]).sum()
    assert reduced.costs["purchase"][0].sum() == pytest.approx(expected * 0.9)
    np.testing.assert_array_equal(leads, 3)


def test_signal_processing_requires_forecast_configuration() -> None:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    usage, leads = network_inputs(net, study.seasonality, 551, 3)
    with pytest.raises(ValueError, match="signal processing"):
        simulate_network(net, usage, leads, bullwhip=load_bullwhip())
