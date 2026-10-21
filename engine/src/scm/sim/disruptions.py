"""Compile event calendars once; daily simulation uses vectorized array slices."""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from scm.contracts import Disruption
from scm.demand.generator import FloatArray
from scm.network.builder import BuiltNetwork


@dataclass
class DisruptionSchedule:
    capacity: FloatArray
    demand: FloatArray
    lead: FloatArray
    moq: FloatArray
    price: FloatArray


def affected_customers(net: BuiltNetwork, target: str) -> NDArray[np.bool_]:
    """SKU/customer descendants of a node or lane in the fixed sourcing network."""
    leaf = net.customer_indices
    parents = net.parent[:, leaf]
    suppliers = np.take_along_axis(net.parent, parents, axis=1)
    if target in net.node_ids:
        node = net.node_ids.index(target)
        return np.asarray(
            (leaf[None, :] == node) | (parents == node) | (suppliers == node), dtype=bool
        )
    lanes = net.as_contract("scope").edges.id
    if target in lanes:
        edge = lanes.index(target)
        return np.asarray(
            ((parents == net.source[edge]) & (leaf[None, :] == net.target[edge]))
            | ((suppliers == net.source[edge]) & (parents == net.target[edge])),
            dtype=bool,
        )
    raise ValueError(f"unknown disruption target: {target}")


def compile_disruptions(net: BuiltNetwork, days: int) -> DisruptionSchedule:
    if isinstance(days, bool) or not isinstance(days, int) or days < 1:
        raise ValueError("disruption calendar requires a positive day count")
    skus, nodes = net.initial_stock.shape
    edges = len(net.source)
    schedule = DisruptionSchedule(
        np.ones((days, nodes)),
        np.ones((days, len(net.customer_indices))),
        np.ones((days, edges)),
        np.ones((days, skus, nodes)),
        np.ones((days, edges)),
    )
    lanes = net.as_contract("events").edges.id
    for configured in net.scenario.disruptions:
        event = Disruption.model_validate(configured.model_dump())
        if event.start_day + event.duration > days:
            raise ValueError("disruption extends beyond supplied simulation inputs")
        active = slice(event.start_day, event.start_day + event.duration)
        node = net.node_ids.index(event.target) if event.target in net.node_ids else -1
        lane = lanes.index(event.target) if event.target in lanes else -1
        if node < 0 and lane < 0:
            raise ValueError(f"unknown disruption target: {event.target}")
        kind, magnitude = event.type, event.magnitude
        outgoing = net.source == node if node >= 0 else np.arange(edges) == lane
        if kind in {"supplier_outage", "capacity_cut"}:
            if node < 0 or not (
                net.is_supplier[node] or (kind == "capacity_cut" and net.is_dc[node])
            ):
                raise ValueError(f"{kind} target must be a dispatch source")
            schedule.capacity[active, node] *= 1 - magnitude
        elif kind == "demand_shock":
            columns = net.customer_indices == node
            if not columns.any():
                raise ValueError("demand shock target must be a customer")
            schedule.demand[active, columns] *= magnitude
        elif kind == "lead_time_multiplier":
            if not outgoing.any():
                raise ValueError("lead-time target must be a source node or lane")
            schedule.lead[active, outgoing] *= magnitude
        elif kind == "moq_change":
            if node >= 0 and net.is_supplier[node]:
                selected = net.parent == node
            elif node >= 0:
                selected = np.broadcast_to(np.arange(nodes) == node, (skus, nodes))
            else:
                selected = (net.edge_for == lane) & (net.parent >= 0)
            schedule.moq[active] *= np.where(selected, magnitude, 1)[None]
        else:
            if not outgoing.any() or not np.all(net.is_supplier[net.source[outgoing]]):
                raise ValueError("price promotion target must be a supplier or inbound lane")
            schedule.price[active, outgoing] *= 1 - magnitude
    if not all(
        np.all(np.isfinite(a))
        for a in (schedule.capacity, schedule.demand, schedule.lead, schedule.moq, schedule.price)
    ):
        raise ValueError("overlapping disruption magnitudes overflow")
    return schedule
