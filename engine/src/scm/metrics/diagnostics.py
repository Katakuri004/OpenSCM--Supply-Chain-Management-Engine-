"""Reconciled representative-run contributors, without arbitrary shared-cost allocation."""

import numpy as np

from scm.contracts import RunDiagnostics
from scm.metrics.kpis import divide
from scm.network.builder import BuiltNetwork
from scm.sim.disruptions import compile_disruptions
from scm.sim.multi_echelon import NetworkResult
from scm.sim.transport import freight


def diagnostics(
    net: BuiltNetwork,
    result: NetworkResult,
    run_id: str,
    seed: int,
    *,
    expedite_unit_cost: float = 0,
) -> RunDiagnostics:
    measured = slice(result.warmup_days, None)
    leaf = net.customer_indices
    demand = result.demand[measured].sum(axis=0)
    shortage = np.maximum(0, result.demand[measured] - result.immediate[measured][:, :, leaf]).sum(
        axis=0
    )
    stock = (result.average_inventory[measured] * net.unit_cost[None, :, None]).mean(axis=0)
    site_demand = np.zeros(len(net.node_ids))
    site_shortage = site_demand.copy()
    site_demand[leaf], site_shortage[leaf] = demand.sum(axis=0), shortage.sum(axis=0)
    capacity = net.capacity[None] * compile_disruptions(net, len(result.demand)).capacity[measured]
    utilization = divide(result.dispatched[measured].sum(axis=(0, 1)), capacity.sum(axis=0))
    volumes = result.edge_shipped[measured].sum(axis=1)
    transport = net.spec.transport
    freight_cost, _, _ = freight(
        volumes,
        net.distance,
        transport.ltl_per_unit_km,
        transport.ftl_capacity,
        transport.ftl_fixed_cost + transport.ftl_per_km * net.distance,
    )
    freight_cost += volumes * expedite_unit_cost
    errors = (
        None
        if result.forecast is None
        else result.forecast[measured][:, :, leaf] - result.demand[measured]
    )
    wmape = None if errors is None else divide(np.abs(errors).sum(axis=(0, 2)), demand.sum(axis=1))
    bias = None if errors is None else divide(errors.sum(axis=(0, 2)), demand.sum(axis=1))

    def finite(value: float) -> float | None:
        return float(value) if np.isfinite(value) else None

    costs = {key: float(values[measured].sum()) for key, values in result.costs.items()}
    payload = RunDiagnostics.model_validate(
        {
            "run_id": run_id,
            "representative_seed": seed,
            "warmup_days": result.warmup_days,
            "horizon_days": len(result.demand) - result.warmup_days,
            "cost_components": costs,
            "facilities": [
                {
                    "id": node,
                    "label": net.nodes.label[i],
                    "kind": net.nodes.type[i],
                    "demand_units": float(site_demand[i]),
                    "shortage_units": float(site_shortage[i]),
                    "inventory_value_inr": float(stock[:, i].sum()),
                    "cost_inr": float(result.measured_cost[i]),
                    "utilization": finite(utilization[i])
                    if net.is_supplier[i] or net.is_dc[i]
                    else None,
                }
                for i, node in enumerate(net.node_ids)
            ],
            "skus": [
                {
                    "id": sku.id,
                    "label": sku.label,
                    "demand_units": float(demand[i].sum()),
                    "shortage_units": float(shortage[i].sum()),
                    "inventory_value_inr": float(stock[i].sum()),
                    "forecast_wmape": None if wmape is None else finite(wmape[i]),
                    "forecast_bias": None if bias is None else finite(bias[i]),
                }
                for i, sku in enumerate(net.spec.skus)
            ],
            "lanes": [
                {
                    "id": f"{net.node_ids[a]}_{net.node_ids[b]}",
                    "source": net.node_ids[a],
                    "target": net.node_ids[b],
                    "shipped_units": float(volumes[:, i].sum()),
                    "freight_inr": float(freight_cost[:, i].sum()),
                    "closing_in_transit_units": float(result.in_transit[-1, :, i].sum()),
                }
                for i, (a, b) in enumerate(zip(net.source, net.target))
            ],
        }
    )
    assert np.isclose(sum(row.cost_inr for row in payload.facilities), sum(costs.values()))
    assert np.isclose(
        sum(row.freight_inr for row in payload.lanes),
        costs["inbound_freight"] + costs["outbound_freight"],
    )
    return payload
