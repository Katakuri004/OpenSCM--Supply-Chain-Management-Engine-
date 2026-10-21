"""Daily multi-echelon inventory flow, with a chronological replenishment queue."""

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike

from scm.config.planning import PlanningSettings
from scm.demand.generator import FloatArray
from scm.network.builder import BuiltNetwork, IntArray
from scm.policies.ordering import order_quantity
from scm.policies.planning import ReplenishmentPlanner
from scm.sim.transport import freight


def _prior_by_group(values: FloatArray, groups: IntArray) -> FloatArray:
    order = np.argsort(groups, kind="stable")
    ordered_groups = groups[order]
    prior = np.cumsum(values[order]) - values[order]
    starts = np.flatnonzero(np.r_[True, ordered_groups[1:] != ordered_groups[:-1]])
    prior -= np.repeat(prior[starts], np.diff(np.r_[starts, len(values)]))
    result = np.empty_like(values)
    result[order] = prior
    return result


def allocate_fifo(
    requests: FloatArray, source: IntArray, sku: IntArray, stock: FloatArray, capacity: FloatArray
) -> FloatArray:
    """Chronological requests; skip unavailable SKUs, share source throughput across SKUs."""
    if not (
        requests.ndim == source.ndim == sku.ndim == capacity.ndim == 1
        and requests.shape == source.shape == sku.shape
        and stock.ndim == 2
        and len(capacity) == len(stock)
    ):
        raise ValueError("FIFO inputs require aligned request vectors and node-by-SKU stock")
    if (
        not np.all(np.isfinite(requests))
        or np.any(requests < 0)
        or not np.all(np.isfinite(capacity))
        or np.any(capacity < 0)
        or np.any(np.isnan(stock))
        or np.any(stock < 0)
        or not np.issubdtype(source.dtype, np.integer)
        or not np.issubdtype(sku.dtype, np.integer)
        or np.any(source < 0)
        or np.any(source >= len(stock))
        or np.any(sku < 0)
        or np.any(sku >= stock.shape[1])
    ):
        raise ValueError("FIFO quantities and indices are invalid")
    if not len(requests):
        return requests.copy()
    available = np.maximum(
        0, stock[source, sku] - _prior_by_group(requests, source * stock.shape[1] + sku)
    )
    units = np.minimum(requests, available)
    return np.minimum(units, np.maximum(0, capacity[source] - _prior_by_group(units, source)))


@dataclass
class NetworkResult:
    demand: FloatArray
    on_hand: FloatArray
    on_order: FloatArray
    customer_backorders: FloatArray
    pending: FloatArray
    received: FloatArray
    produced: FloatArray
    dispatched: FloatArray
    fulfilled: FloatArray
    immediate: FloatArray
    orders: FloatArray
    lost: FloatArray
    average_inventory: FloatArray
    edge_shipped: FloatArray
    edge_received: FloatArray
    in_transit: FloatArray
    ftl_trips: FloatArray
    ltl_units: FloatArray
    costs: dict[str, FloatArray]
    warmup_days: int
    initial_stock: FloatArray | None = None
    forecast: FloatArray | None = None
    observed_demand: FloatArray | None = None

    @property
    def total_cost(self) -> FloatArray:
        return np.sum(list(self.costs.values()), axis=0)

    @property
    def measured_cost(self) -> FloatArray:
        return self.total_cost[self.warmup_days :].sum(axis=0)


def simulate_network(
    net: BuiltNetwork,
    demand: ArrayLike,
    lead_times: ArrayLike,
    *,
    warmup_days: int = 0,
    lost_sales: bool = False,
    planning: PlanningSettings | None = None,
    demand_history: ArrayLike | None = None,
) -> NetworkResult:
    """Node histories are day × SKU × node; shipment histories are day × SKU × edge."""
    usage, leads = np.asarray(demand, dtype=float), np.asarray(lead_times)
    skus, nodes = net.initial_stock.shape
    edges, leaf = len(net.source), net.customer_indices
    if (
        usage.ndim != 3
        or usage.shape[1:] != (skus, len(leaf))
        or usage.shape[0] == 0
        or not np.all(np.isfinite(usage))
        or np.any(usage < 0)
    ):
        raise ValueError("demand must be finite nonnegative day-by-SKU-by-customer quantities")
    days = usage.shape[0]
    if (
        isinstance(warmup_days, bool)
        or not isinstance(warmup_days, int)
        or not 0 <= warmup_days < days
        or not isinstance(lost_sales, bool)
    ):
        raise ValueError("warmup_days must leave measured days; lost_sales must be boolean")
    if (
        leads.shape != (days, edges)
        or not np.issubdtype(leads.dtype, np.integer)
        or np.any(leads < 1)
        or np.any(leads > np.iinfo(np.int64).max // 2)
    ):
        raise ValueError(
            "lead_times must be positive integer day counts, indexed by order day/edge"
        )
    if (
        not np.all(np.isfinite(net.initial_stock))
        or np.any(net.initial_stock < 0)
        or np.any(net.initial_stock[:, net.is_supplier] != 0)
        or not np.all(np.isfinite(net.capacity))
        or np.any(net.capacity < 0)
    ):
        raise ValueError("initial stock/capacity must be nonnegative; suppliers hold no stock")
    history = np.zeros((12, days, skus, nodes))
    shipments = np.zeros((3, days, skus, edges))
    modes = np.zeros((2, days, edges))
    costs = {
        name: np.zeros((days, nodes))
        for name in (
            "purchase",
            "inbound_freight",
            "outbound_freight",
            "holding",
            "ordering",
            "dc_fixed",
            "shortage",
            "handling",
        )
    }
    result = NetworkResult(
        demand=usage.copy(),
        on_hand=history[0],
        on_order=history[1],
        customer_backorders=history[2],
        pending=history[3],
        received=history[4],
        produced=history[5],
        dispatched=history[6],
        fulfilled=history[7],
        immediate=history[8],
        orders=history[9],
        lost=history[10],
        average_inventory=history[11],
        edge_shipped=shipments[0],
        edge_received=shipments[1],
        in_transit=shipments[2],
        ftl_trips=modes[0],
        ltl_units=modes[1],
        costs=costs,
        warmup_days=warmup_days,
    )
    if (planning is None) != (demand_history is None):
        raise ValueError("planning settings and past demand_history must be supplied together")
    planner = None
    if planning is not None:
        assert demand_history is not None
        planner = ReplenishmentPlanner(net, planning, demand_history)
    stock = net.initial_stock.copy() if planner is None else planner.initial_stock.copy()
    result.initial_stock = stock.copy()
    if planner is not None:
        result.forecast = np.zeros_like(result.on_hand)
        result.observed_demand = np.zeros_like(result.on_hand)
        result.observed_demand[:, :, leaf] = usage
    on_order, backlog, pending = np.zeros_like(stock), np.zeros_like(stock), np.zeros_like(stock)
    transit = np.zeros((skus, edges))
    arrivals = np.zeros_like(result.edge_received)
    queue = np.zeros((days, nodes, skus))
    sku_axis = np.arange(skus)[:, None]
    retailers = ~net.is_supplier & ~net.is_dc
    trip_cost = net.spec.transport.ftl_fixed_cost + net.distance * net.spec.transport.ftl_per_km

    def place_orders(day: int, mask: np.ndarray[tuple[int], np.dtype[np.bool_]]) -> None:
        position = stock[:, mask] + on_order[:, mask] - backlog[:, mask] - pending[:, mask]
        q, reorder, upper = (
            (net.quantity[:, mask], net.reorder[:, mask], net.upper[:, mask])
            if planner is None
            else planner.targets(mask)
        )
        policy = (
            np.asarray(net.scenario.policy.default) if planner is None else planner.policy[:, mask]
        )
        placed = order_quantity(
            position,
            policy,
            q,
            reorder,
            upper,
            net.spec.inventory.review_days,
            day,
            net.moq[:, mask],
            net.pack[:, mask],
        )
        result.orders[day][:, mask] = placed
        queue[day, mask] = placed.T
        on_order[:, mask] += placed
        np.add.at(pending, (sku_axis, net.parent[:, mask]), placed)
        lot = np.ceil(np.maximum(q, net.moq[:, mask]) / net.pack[:, mask]) * net.pack[:, mask]
        events = np.where(policy == "QR", placed / lot, placed > 0)
        costs["ordering"][day, mask] = events.sum(axis=0) * net.order_cost[mask]

    for day in range(days):
        if planner is not None and result.forecast is not None:
            result.forecast[day] = planner.mean
        received = result.received[day]
        result.edge_received[day] = arrivals[day]
        transit -= arrivals[day]
        np.add.at(received, (sku_axis, net.target), arrivals[day])
        stock += received
        on_order -= received
        cleared = np.minimum(stock[:, leaf], backlog[:, leaf])
        stock[:, leaf] -= cleared
        backlog[:, leaf] -= cleared
        opening = stock.copy()
        immediate = np.minimum(stock[:, leaf], usage[day])
        shortfall = usage[day] - immediate
        stock[:, leaf] -= immediate
        if lost_sales:
            result.lost[day][:, leaf] = shortfall
        else:
            backlog[:, leaf] += shortfall
        result.fulfilled[day][:, leaf] = cleared + immediate
        result.immediate[day][:, leaf] = immediate
        fraction = np.divide(
            immediate, usage[day], out=np.ones_like(immediate), where=usage[day] > 0
        )
        average = opening.copy()
        average[:, leaf] = (opening[:, leaf] + stock[:, leaf]) * fraction / 2
        if planner is not None:
            planner.update(usage[day], dc=False)
        place_orders(day, retailers)
        if planner is not None and result.observed_demand is not None:
            observed = result.observed_demand[day]
            np.add.at(observed, (sku_axis, net.parent[:, leaf]), result.orders[day][:, leaf])
            planner.update(observed[:, net.is_dc], dc=True)
        place_orders(day, net.is_dc)

        queued = queue[: day + 1].reshape(-1)
        indices = np.flatnonzero(queued > 0)
        order_day, dest, sku = np.unravel_index(indices, (day + 1, nodes, skus))
        source = net.parent[sku, dest]
        available = stock.T.copy()
        available[net.is_supplier] = np.inf
        allocated = allocate_fifo(queued[indices], source, sku, available, net.capacity)
        queued[indices] -= allocated
        np.add.at(pending, (sku, source), -allocated)
        np.add.at(result.dispatched[day], (sku, source), allocated)
        produced = result.produced[day]
        produced[:, net.is_supplier] = result.dispatched[day][:, net.is_supplier]
        stock += produced - result.dispatched[day]
        # Grouped floating-point sums can overshoot exhausted stock by a few ulps.
        np.maximum(stock, 0, out=stock)
        edge = net.edge_for[sku, dest]
        np.add.at(result.edge_shipped[day], (sku, edge), allocated)
        transit += result.edge_shipped[day]
        due = day + leads[order_day, edge]
        within = due < days
        np.add.at(arrivals, (due[within], sku[within], edge[within]), allocated[within])

        volumes = result.edge_shipped[day].sum(axis=0)
        freight_cost, trips, ltl = freight(
            volumes,
            net.distance,
            net.spec.transport.ltl_per_unit_km,
            net.spec.transport.ftl_capacity,
            trip_cost,
        )
        inbound = net.is_supplier[net.source]
        np.add.at(costs["inbound_freight"][day], net.target[inbound], freight_cost[inbound])
        np.add.at(costs["outbound_freight"][day], net.target[~inbound], freight_cost[~inbound])
        purchase = (result.edge_shipped[day] * net.unit_cost[:, None]).sum(axis=0)
        np.add.at(costs["purchase"][day], net.target[inbound], purchase[inbound])
        costs["holding"][day] = (
            (average * net.unit_cost[:, None]).sum(axis=0) * net.holding_rate / 365
        )
        costs["dc_fixed"][day] = net.fixed_cost
        costs["shortage"][day, leaf] = shortfall.sum(axis=0) * net.shortage_penalty[leaf]
        costs["handling"][day] = result.dispatched[day].sum(axis=0) * net.handling_cost
        result.on_hand[day], result.on_order[day] = stock, on_order
        result.customer_backorders[day], result.pending[day] = backlog, pending
        result.average_inventory[day], result.in_transit[day] = average, transit
        result.ftl_trips[day], result.ltl_units[day] = trips, ltl
    return result
