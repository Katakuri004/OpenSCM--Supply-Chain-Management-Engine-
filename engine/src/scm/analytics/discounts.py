from collections.abc import Sequence
from dataclasses import dataclass

from ._validation import nonnegative, positive
from .eoq import annual_cost, eoq


@dataclass(frozen=True)
class DiscountResult:
    quantity: float
    unit_price: float
    annual_cost: float


def all_units_discount(
    annual_demand: float,
    order_cost: float,
    holding_rate: float,
    tiers: Sequence[tuple[float, float]],
) -> DiscountResult:
    """Minimize purchase + ordering + holding cost over (minimum quantity, price) tiers."""
    nonnegative(annual_demand=annual_demand)
    positive(order_cost=order_cost, holding_rate=holding_rate)
    if not tiers or tiers[0][0] != 0:
        raise ValueError("tiers must start at quantity zero")
    for index, (minimum, price) in enumerate(tiers):
        nonnegative(minimum=minimum)
        positive(price=price)
        if index and (minimum <= tiers[index - 1][0] or price > tiers[index - 1][1]):
            raise ValueError("tier quantities must increase and prices must not increase")
    candidates = []
    for index, (minimum, price) in enumerate(tiers):
        holding_cost = holding_rate * price
        quantity = max(minimum, eoq(annual_demand, order_cost, holding_cost))
        if index + 1 < len(tiers) and quantity >= tiers[index + 1][0]:
            continue
        cost = annual_demand * price + annual_cost(
            quantity, annual_demand, order_cost, holding_cost
        )
        candidates.append(DiscountResult(quantity, price, cost))
    return min(candidates, key=lambda candidate: candidate.annual_cost)
