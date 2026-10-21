from dataclasses import dataclass
from typing import Annotated

import numpy as np
from numpy.typing import ArrayLike
from pydantic import Field

from scm.contracts import Contract, Nonnegative
from scm.demand.generator import FloatArray


class SingleNodeConfig(Contract):
    quantity: Annotated[float, Field(gt=0)]
    reorder_point: Nonnegative
    initial_on_hand: Nonnegative
    warmup_days: Annotated[int, Field(ge=0)] = 90
    order_cost: Nonnegative
    unit_cost: Nonnegative
    annual_holding_cost: Nonnegative
    shortage_cost: Nonnegative
    lost_sales: bool = False


@dataclass
class SimulationResult:
    demand: FloatArray
    on_hand: FloatArray
    on_order: FloatArray
    backorders: FloatArray
    received: FloatArray
    fulfilled: FloatArray
    immediate: FloatArray
    orders: FloatArray
    lost: FloatArray
    average_inventory: FloatArray
    costs: dict[str, FloatArray]
    completed_cycles: FloatArray
    successful_cycles: FloatArray
    warmup_days: int

    @property
    def total_cost(self) -> FloatArray:
        return np.sum(list(self.costs.values()), axis=0)

    @property
    def measured_cost(self) -> FloatArray:
        return self.total_cost[self.warmup_days :].sum(axis=0)

    @property
    def fill_rate(self) -> FloatArray:
        denominator = self.demand[self.warmup_days :].sum(axis=0)
        return np.divide(
            self.immediate[self.warmup_days :].sum(axis=0),
            denominator,
            out=np.full_like(denominator, np.nan),
            where=denominator > 0,
        )

    @property
    def cycle_service_level(self) -> FloatArray:
        return np.divide(
            self.successful_cycles,
            self.completed_cycles,
            out=np.full_like(self.completed_cycles, np.nan),
            where=self.completed_cycles > 0,
        )


def simulate(
    demand: ArrayLike, lead_times: ArrayLike, config: SingleNodeConfig
) -> SimulationResult:
    """One stocking node; columns are independent SKUs/replications with one shared policy."""
    usage, leads = np.asarray(demand, dtype=float), np.asarray(lead_times)
    if usage.ndim != 2 or min(usage.shape) == 0 or config.warmup_days >= usage.shape[0]:
        raise ValueError("demand must be nonempty (day, series), with measured days after warm-up")
    if not np.all(np.isfinite(usage)) or np.any(usage < 0):
        raise ValueError("demand must be finite and nonnegative")
    if (
        leads.shape != usage.shape
        or not np.issubdtype(leads.dtype, np.integer)
        or np.any(leads < 1)
        or np.any(leads > np.iinfo(np.int64).max // 2)
    ):
        raise ValueError("lead_times must be matching positive integer day counts")
    days, series = usage.shape
    history = np.zeros((9, days, series))
    costs = {name: np.zeros_like(usage) for name in ("purchase", "ordering", "holding", "shortage")}
    on_hand = np.full(series, config.initial_on_hand)
    on_order, backlog = np.zeros(series), np.zeros(series)
    arrivals = np.zeros_like(usage)
    cycle_start = np.full(series, -1)
    failed = np.zeros(series, dtype=bool)
    cycles, successes = np.zeros(series), np.zeros(series)
    columns = np.arange(series)
    for day in range(days):
        received = arrivals[day]
        closed = (received > 0) & (cycle_start >= config.warmup_days)
        cycles += closed
        successes += closed & ~failed
        cycle_start = np.where(received > 0, day, cycle_start)
        failed = np.where(received > 0, False, failed)
        on_hand += received
        on_order -= received
        cleared = np.minimum(on_hand, backlog)
        on_hand -= cleared
        backlog -= cleared
        opening = on_hand.copy()
        immediate = np.minimum(on_hand, usage[day])
        shortfall = usage[day] - immediate
        on_hand -= immediate
        lost = shortfall if config.lost_sales else np.zeros(series)
        backlog += shortfall - lost
        failed |= (shortfall > 0) | (backlog > 0)
        position = on_hand + on_order - backlog
        lots = np.maximum(0, np.ceil((config.reorder_point - position) / config.quantity))
        ordered = lots * config.quantity
        on_order += ordered
        arrival_day = day + leads[day]
        within = arrival_day < days
        arrivals[arrival_day[within], columns[within]] += ordered[within]
        fraction = np.divide(immediate, usage[day], out=np.ones(series), where=usage[day] > 0)
        average = (opening + on_hand) * fraction / 2
        costs["purchase"][day] = ordered * config.unit_cost
        costs["ordering"][day] = lots * config.order_cost
        costs["holding"][day] = average * config.annual_holding_cost / 365
        costs["shortage"][day] = shortfall * config.shortage_cost
        history[:, day, :] = (
            on_hand,
            on_order,
            backlog,
            received,
            cleared + immediate,
            immediate,
            ordered,
            lost,
            average,
        )
    return SimulationResult(
        demand=usage.copy(),
        on_hand=history[0],
        on_order=history[1],
        backorders=history[2],
        received=history[3],
        fulfilled=history[4],
        immediate=history[5],
        orders=history[6],
        lost=history[7],
        average_inventory=history[8],
        costs=costs,
        completed_cycles=cycles,
        successful_cycles=successes,
        warmup_days=config.warmup_days,
    )
