from math import sqrt

from ._validation import nonnegative, positive


def eoq(annual_demand: float, order_cost: float, holding_cost: float) -> float:
    """Units per order; holding_cost is currency per unit per year."""
    nonnegative(annual_demand=annual_demand)
    positive(order_cost=order_cost, holding_cost=holding_cost)
    return sqrt(2 * annual_demand * order_cost / holding_cost)


def annual_cost(
    quantity: float, annual_demand: float, order_cost: float, holding_cost: float
) -> float:
    """Annual ordering plus cycle-stock holding cost, excluding purchases."""
    nonnegative(quantity=quantity, annual_demand=annual_demand)
    positive(order_cost=order_cost, holding_cost=holding_cost)
    if quantity == 0:
        if annual_demand == 0:
            return 0.0
        raise ValueError("quantity must be positive when demand is positive")
    return annual_demand * order_cost / quantity + holding_cost * quantity / 2
