from ._validation import nonnegative, positive
from .safety_stock import z_for_csl


def critical_ratio(underage_cost: float, overage_cost: float) -> float:
    """Cu/(Cu+Co); Cu = selling price - cost, Co = cost - salvage value."""
    positive(underage_cost=underage_cost, overage_cost=overage_cost)
    return underage_cost / (underage_cost + overage_cost)


def normal_quantity(mean: float, std: float, underage_cost: float, overage_cost: float) -> float:
    """Optimal nonnegative order for normal demand (or its zero-censored version)."""
    nonnegative(mean=mean, std=std)
    z = z_for_csl(critical_ratio(underage_cost, overage_cost))
    return max(0.0, mean + std * z)
