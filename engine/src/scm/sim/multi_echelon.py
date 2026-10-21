"""Daily multi-echelon inventory flow, with a chronological replenishment queue."""

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike

from scm.config.bullwhip import BullwhipSettings
from scm.config.mitigation import MitigationSettings
from scm.config.planning import PlanningSettings
from scm.demand.generator import FloatArray
from scm.network.builder import BuiltNetwork, IntArray
from scm.policies.bullwhip import nominal_demand, replenishment_order
from scm.policies.ordering import order_quantity
from scm.policies.planning import ReplenishmentPlanner
from scm.sim.disruptions import compile_disruptions
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
    supply_fill: FloatArray | None = None

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
    bullwhip: BullwhipSettings | None = None,
    mitigation: MitigationSettings | None = None,
    outbound_freight_factor: float = 1,
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
    if not np.isfinite(outbound_freight_factor) or outbound_freight_factor <= 0:
        raise ValueError("outbound freight factor must be positive and finite")
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
    disruptions = compile_disruptions(net, days) if net.scenario.disruptions else None
    if disruptions is not None:
        usage = usage * disruptions.demand[:, None, :]
        scaled_leads = np.ceil(leads * disruptions.lead)
        if (
            not np.all(np.isfinite(usage))
            or not np.all(np.isfinite(scaled_leads))
            or np.any(scaled_leads > np.iinfo(np.int64).max // 2)
        ):
            raise ValueError("disruption demand or transit exceeds numeric limits")
        leads = np.maximum(1, scaled_leads).astype(np.int64)
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
    flags = net.scenario.bullwhip
    if bullwhip is not None and flags.signal_processing and planning is None:
        raise ValueError("signal processing requires planning settings and demand history")
    if bullwhip is not None and planning is not None and planning.segmented:
        raise ValueError("bullwhip experiments require uniform planning (segmented=False)")
    planner = None
    if planning is not None and (bullwhip is None or flags.signal_processing):
        assert demand_history is not None
        planner = ReplenishmentPlanner(net, planning, demand_history)
    review = net.spec.inventory.review_days
    if bullwhip is not None:
        review = bullwhip.batch_days if flags.batching and not bullwhip.vmi else 1
        leads = np.maximum(1, np.ceil(leads * bullwhip.lead_time_factor)).astype(np.int64)
        if planner is not None:
            planner.policy[:] = "RS" if review > 1 else "order_up_to"
            planner.lead = np.maximum(1, planner.lead * bullwhip.lead_time_factor)
            planner.lead_variance *= bullwhip.lead_time_factor**2
            planner.initial_stock = planner.targets(np.ones(nodes, dtype=bool), review_days=review)[
                2
            ]
            planner.initial_stock *= net.spec.inventory.initial_stock_fraction
            planner.initial_stock[:, net.is_supplier] = 0
    buffer = np.zeros_like(net.initial_stock)
    backup = np.full(nodes, -1, dtype=np.int64)
    lane_index = np.full((nodes, nodes), -1, dtype=np.int64)
    lane_index[net.source, net.target] = np.arange(edges)
    purchase_unit = np.broadcast_to(net.unit_cost[:, None], (skus, edges)).copy()
    if mitigation is not None:
        buffer = nominal_demand(net) * mitigation.buffer_days
        leads = np.maximum(1, np.ceil(leads * mitigation.expedite_factor)).astype(np.int64)
        for primary, secondary_id in mitigation.backup_suppliers.items():
            if (
                primary == secondary_id
                or primary not in net.node_ids
                or secondary_id not in net.node_ids
            ):
                raise ValueError("backup suppliers must be distinct selected suppliers")
            a, b = net.node_ids.index(primary), net.node_ids.index(secondary_id)
            if not net.is_supplier[a] or not net.is_supplier[b]:
                raise ValueError("backup targets must be suppliers")
            backup[a] = b
        supplier_prices = {s.id: s.price_multiplier for s in net.spec.suppliers}
        inbound_edges = net.is_supplier[net.source]
        purchase_unit[:, inbound_edges] = np.array([s.unit_cost for s in net.spec.skus])[
            :, None
        ] * np.array([supplier_prices[net.node_ids[i]] for i in net.source[inbound_edges]])
    stock = (net.initial_stock.copy() if planner is None else planner.initial_stock.copy()) + buffer
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
    nominal = nominal_demand(net) if bullwhip is not None else np.zeros_like(stock)
    waiting, supply_fill = np.zeros_like(stock), np.ones_like(stock)
    if bullwhip is not None:
        result.supply_fill = np.zeros_like(result.on_hand)
    retailers = ~net.is_supplier & ~net.is_dc
    trip_cost = net.spec.transport.ftl_fixed_cost + net.distance * net.spec.transport.ftl_per_km

    def place_orders(day: int, mask: np.ndarray[tuple[int], np.dtype[np.bool_]]) -> None:
        position = stock[:, mask] + on_order[:, mask] - backlog[:, mask] - pending[:, mask]
        minimum = net.moq[:, mask]
        if disruptions is not None:
            minimum = minimum * disruptions.moq[day][:, mask]
        q, reorder, upper = (
            (net.quantity[:, mask], net.reorder[:, mask], net.upper[:, mask])
            if planner is None
            else planner.targets(mask, review_days=review)
        )
        policy = (
            np.asarray(net.scenario.policy.default) if planner is None else planner.policy[:, mask]
        )
        reorder = reorder + buffer[:, mask]
        upper = upper + buffer[:, mask]
        if bullwhip is None:
            placed = order_quantity(
                position,
                policy,
                q,
                reorder,
                upper,
                review,
                day,
                minimum,
                net.pack[:, mask],
            )
        else:
            mean = nominal[:, mask] if planner is None else planner.mean[:, mask]
            if planner is None:
                upper = np.maximum(
                    0,
                    upper
                    + mean * (review - 1)
                    - mean * net.lead_mean[net.edge_for[:, mask]] * (1 - bullwhip.lead_time_factor),
                )
            placed = replenishment_order(
                position,
                upper,
                mean,
                supply_fill[:, mask],
                minimum,
                net.pack[:, mask],
                flags,
                bullwhip,
                day,
            )
            if disruptions is not None:
                placed = np.where(
                    (disruptions.moq[day][:, mask] != 1) & (placed > 0),
                    np.ceil(np.maximum(placed, minimum) / net.pack[:, mask]) * net.pack[:, mask],
                    placed,
                )
            waiting[:, mask] += placed
        result.orders[day][:, mask] = placed
        queue[day, mask] = placed.T
        on_order[:, mask] += placed
        np.add.at(pending, (sku_axis, net.parent[:, mask]), placed)
        lot = np.ceil(np.maximum(q, minimum) / net.pack[:, mask]) * net.pack[:, mask]
        events = (
            np.where(policy == "QR", placed / lot, placed > 0) if bullwhip is None else placed > 0
        )
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
            pos = bullwhip is not None and (flags.pos_sharing or bullwhip.vmi)
            signal = usage[day] if pos else result.orders[day][:, leaf]
            np.add.at(observed, (sku_axis, net.parent[:, leaf]), signal)
            planner.update(observed[:, net.is_dc], dc=True)
        place_orders(day, net.is_dc)

        queued = queue[: day + 1].reshape(-1)
        indices = np.flatnonzero(queued > 0)
        order_day, dest, sku = np.unravel_index(indices, (day + 1, nodes, skus))
        source = net.parent[sku, dest]
        available = stock.T.copy()
        available[net.is_supplier] = np.inf
        capacity = net.capacity if disruptions is None else net.capacity * disruptions.capacity[day]
        allocated = allocate_fifo(queued[indices], source, sku, available, capacity)
        edge = net.edge_for[sku, dest]
        if mitigation is not None and mitigation.backup_suppliers:
            eligible = np.flatnonzero((backup[source] >= 0) & (queued[indices] > allocated))
            used = np.bincount(source, weights=allocated, minlength=nodes)
            secondary = backup[source[eligible]]
            extra = allocate_fifo(
                queued[indices][eligible] - allocated[eligible],
                secondary,
                sku[eligible],
                available,
                np.maximum(0, capacity - used),
            )
            queued[indices] -= allocated
            queued[indices[eligible]] -= extra
            np.add.at(pending, (sku, source), -allocated)
            np.add.at(pending, (sku[eligible], source[eligible]), -extra)
            edge = np.r_[edge, lane_index[secondary, dest[eligible]]]
            source = np.r_[source, secondary]
            order_day = np.r_[order_day, order_day[eligible]]
            dest = np.r_[dest, dest[eligible]]
            sku = np.r_[sku, sku[eligible]]
            allocated = np.r_[allocated, extra]
        else:
            queued[indices] -= allocated
            np.add.at(pending, (sku, source), -allocated)
        if bullwhip is not None and result.supply_fill is not None:
            shipped_to_node = np.zeros_like(stock)
            np.add.at(shipped_to_node, (sku, dest), allocated)
            supply_fill = np.clip(
                np.divide(shipped_to_node, waiting, out=np.ones_like(waiting), where=waiting > 0),
                0,
                1,
            )
            waiting = np.maximum(0, waiting - shipped_to_node)
            result.supply_fill[day] = supply_fill
        np.add.at(result.dispatched[day], (sku, source), allocated)
        produced = result.produced[day]
        produced[:, net.is_supplier] = result.dispatched[day][:, net.is_supplier]
        stock += produced - result.dispatched[day]
        # Grouped floating-point sums can overshoot exhausted stock by a few ulps.
        np.maximum(stock, 0, out=stock)
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
        freight_cost[~inbound] *= outbound_freight_factor
        if mitigation is not None:
            freight_cost += volumes * mitigation.expedite_unit_cost
        np.add.at(costs["inbound_freight"][day], net.target[inbound], freight_cost[inbound])
        np.add.at(costs["outbound_freight"][day], net.target[~inbound], freight_cost[~inbound])
        purchase = (result.edge_shipped[day] * purchase_unit).sum(axis=0)
        if disruptions is not None:
            purchase *= disruptions.price[day]
        if bullwhip is not None and flags.price and bullwhip.promotion(day):
            purchase *= 1 - bullwhip.discount_fraction
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
