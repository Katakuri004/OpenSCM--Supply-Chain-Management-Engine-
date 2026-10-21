"""Node and customer-network metrics from a completed replication."""

import numpy as np
from numpy.typing import ArrayLike

from scm.config.api import ApiSettings
from scm.demand.generator import FloatArray
from scm.metrics.bullwhip import aggregate_periods
from scm.network.builder import BuiltNetwork
from scm.policies.bullwhip import nominal_demand
from scm.sim.multi_echelon import NetworkResult


def divide(numerator: ArrayLike, denominator: ArrayLike) -> FloatArray:
    numerator, denominator = np.broadcast_arrays(
        np.asarray(numerator, dtype=float), np.asarray(denominator, dtype=float)
    )
    return np.asarray(
        np.divide(
            numerator,
            denominator,
            out=np.full_like(numerator, np.nan, dtype=float),
            where=denominator > 0,
        ),
        dtype=float,
    )


def observation_arrays(
    net: BuiltNetwork, result: NetworkResult
) -> tuple[FloatArray, FloatArray, dict[str, FloatArray], FloatArray]:
    assert result.source_immediate is not None
    days, skus, nodes = result.on_hand.shape
    leaf = net.customer_indices
    downstream = ~net.is_supplier
    signal = np.zeros_like(result.on_hand)
    signal[:, :, leaf] = result.demand
    np.add.at(
        signal,
        (
            np.arange(days)[:, None, None],
            np.arange(skus)[None, :, None],
            net.parent[:, downstream][None],
        ),
        result.orders[:, :, downstream],
    )
    served = result.immediate + result.source_immediate
    backlog = np.maximum(0, result.customer_backorders + result.pending)
    mean = nominal_demand(net)
    np.add.at(mean, (np.arange(skus)[:, None], net.parent[:, net.is_dc]), mean[:, net.is_dc])
    forecasts = np.broadcast_to(mean[None], result.on_hand.shape).copy()
    if result.forecast is not None:
        forecasts[:, :, downstream] = result.forecast[:, :, downstream]
    arrays = {
        "on_hand": result.on_hand,
        "on_order": np.maximum(0, result.on_order),
        "backorders": backlog,
        "fill_rate": np.clip(divide(served, signal), 0, 1),
        "days_of_cover": divide(result.on_hand, forecasts),
    }
    return signal, served, arrays, forecasts


def replication_kpis(
    net: BuiltNetwork, result: NetworkResult, settings: ApiSettings
) -> tuple[dict[str, FloatArray], FloatArray, dict[str, FloatArray]]:
    signal, served, arrays, expected = observation_arrays(net, result)
    days, skus, nodes = signal.shape
    measured = slice(result.warmup_days, None)
    horizon = days - result.warmup_days
    leaf = net.customer_indices
    failure = (signal - served > 1e-8) | (arrays["backorders"] > 1e-8)
    completed = np.zeros((skus, nodes))
    successes = completed.copy()
    start = np.full((skus, nodes), -1)
    failed = np.zeros_like(start, dtype=bool)
    for day in range(days):
        arrives = result.received[day] > 0
        closed = arrives & (start >= result.warmup_days)
        completed += closed
        successes += closed & ~failed
        start = np.where(arrives, day, start)
        failed = np.where(arrives, False, failed) | failure[day]

    def with_network(values: FloatArray, network: float) -> FloatArray:
        return np.asarray(np.r_[values, network], dtype=float)

    fill = divide(served[measured].sum(axis=(0, 1)), signal[measured].sum(axis=(0, 1)))
    network_fill = float(divide(result.immediate[measured].sum(), result.demand[measured].sum()))
    cycle = divide(successes.sum(axis=0), completed.sum(axis=0))
    network_cycle = float(divide(successes[:, leaf].sum(), completed[:, leaf].sum()))
    inventory = (
        (result.average_inventory[measured] * net.unit_cost[None, :, None]).sum(axis=1).mean(axis=0)
    )
    shipped = result.dispatched + result.fulfilled
    cogs = (shipped[measured] * net.unit_cost[None, :, None]).sum(axis=(0, 1)) * 365 / horizon
    network_cogs = float(
        (result.fulfilled[measured][:, :, leaf] * net.unit_cost[None, :, None]).sum()
        * 365
        / horizon
    )
    turns = with_network(
        divide(cogs, inventory),
        float(divide(np.asarray(network_cogs), np.asarray(inventory.sum()))),
    )
    dio = divide(np.full_like(turns, 365.0), turns)
    demand_lines = signal[measured] > 0
    ontime_lines = demand_lines & (signal[measured] - served[measured] <= 1e-8)
    otif = divide(
        ontime_lines.sum(axis=(0, 1)).astype(float), demand_lines.sum(axis=(0, 1)).astype(float)
    )
    network_otif = float(
        divide(
            ontime_lines[:, :, leaf].sum().astype(float),
            demand_lines[:, :, leaf].sum().astype(float),
        )
    )
    node_stockout = failure[measured].any(axis=1).sum(axis=0).astype(float)
    network_stockout = float(failure[measured][:, :, leaf].any(axis=(1, 2)).sum())
    bwe = np.full(nodes + 1, np.nan)
    if horizon // 7 >= 2:
        consumption = np.zeros_like(signal)
        consumption[:, :, leaf] = result.demand
        np.add.at(
            consumption,
            (
                np.arange(days)[:, None, None],
                np.arange(skus)[None, :, None],
                net.parent[:, leaf][None],
            ),
            result.demand,
        )
        np.add.at(
            consumption,
            (
                np.arange(days)[:, None, None],
                np.arange(skus)[None, :, None],
                net.parent[:, net.is_dc][None],
            ),
            consumption[:, :, net.is_dc],
        )
        orders = result.orders.sum(axis=1)
        orders[:, net.is_supplier] = signal.sum(axis=1)[:, net.is_supplier]
        denominator = aggregate_periods(
            consumption.sum(axis=1), warmup_days=result.warmup_days
        ).var(axis=0, ddof=1)
        numerator = aggregate_periods(orders, warmup_days=result.warmup_days).var(axis=0, ddof=1)
        bwe[:nodes] = divide(numerator, denominator)
        customer = aggregate_periods(result.demand.sum(axis=(1, 2)), warmup_days=result.warmup_days)
        dc_orders = aggregate_periods(
            result.orders[:, :, net.is_dc].sum(axis=(1, 2)), warmup_days=result.warmup_days
        )
        bwe[-1] = float(divide(np.asarray(dc_orders.var(ddof=1)), np.asarray(customer.var(ddof=1))))
    metrics = {
        "fill_rate": np.clip(with_network(fill, network_fill), 0, 1),
        "cycle_service_level": with_network(cycle, network_cycle),
        "stockout_days": with_network(node_stockout, network_stockout),
        "inventory_turns": turns,
        "days_of_inventory": dio,
        "cash_to_cash_days": dio
        + settings.days_sales_outstanding
        - settings.days_payables_outstanding,
        "otif": with_network(otif, network_otif),
        "total_landed_cost_inr": with_network(
            result.measured_cost, float(result.measured_cost.sum())
        ),
        "bullwhip_ratio": bwe,
    }
    node_arrays = {
        "on_hand": result.on_hand.sum(axis=1),
        "on_order": arrays["on_order"].sum(axis=1),
        "backorders": arrays["backorders"].sum(axis=1),
        "fill_rate": np.clip(divide(served.sum(axis=1), signal.sum(axis=1)), 0, 1),
        "days_of_cover": divide(result.on_hand.sum(axis=1), expected.sum(axis=1)),
        "stockout": failure.any(axis=1).astype(float),
    }
    return (
        metrics,
        np.array([value[measured].sum() for value in result.costs.values()]),
        arrays | {f"node_{k}": v for k, v in node_arrays.items()},
    )
