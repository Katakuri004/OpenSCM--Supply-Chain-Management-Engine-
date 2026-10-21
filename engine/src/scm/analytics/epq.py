from math import sqrt

from ._validation import positive
from .eoq import eoq


def epq(
    annual_demand: float, order_cost: float, holding_cost: float, annual_production: float
) -> float:
    """Production lot size; annual production capacity must exceed annual demand."""
    quantity = eoq(annual_demand, order_cost, holding_cost)
    positive(annual_production=annual_production)
    if annual_production <= annual_demand:
        raise ValueError("annual_production must exceed annual_demand")
    return quantity / sqrt(1 - annual_demand / annual_production)
