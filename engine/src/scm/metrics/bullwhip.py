import numpy as np
from numpy.typing import ArrayLike

from scm.demand.generator import FloatArray
from scm.network.builder import BuiltNetwork
from scm.sim.multi_echelon import NetworkResult


def aggregate_periods(
    values: ArrayLike, *, warmup_days: int = 0, period_days: int = 7
) -> FloatArray:
    data = np.asarray(values, dtype=float)
    if (
        data.ndim < 1
        or not np.all(np.isfinite(data))
        or isinstance(warmup_days, bool)
        or not isinstance(warmup_days, int)
        or not 0 <= warmup_days < len(data)
        or isinstance(period_days, bool)
        or not isinstance(period_days, int)
        or period_days < 1
    ):
        raise ValueError("require finite daily series, valid warm-up, and positive integer period")
    periods = (len(data) - warmup_days) // period_days
    if periods < 2:
        raise ValueError("bullwhip variance requires at least two complete measured periods")
    measured = data[warmup_days : warmup_days + periods * period_days]
    return np.asarray(measured.reshape(periods, period_days, *data.shape[1:]).sum(axis=1))


def bullwhip_ratio(
    orders: ArrayLike, demand: ArrayLike, *, warmup_days: int = 0, period_days: int = 7
) -> FloatArray:
    replenishment = aggregate_periods(orders, warmup_days=warmup_days, period_days=period_days)
    customer = aggregate_periods(demand, warmup_days=warmup_days, period_days=period_days)
    if (
        replenishment.shape != customer.shape
        or np.asarray(orders).shape != np.asarray(demand).shape
    ):
        raise ValueError("orders and demand must have matching day/series axes")
    numerator, denominator = replenishment.var(axis=0, ddof=1), customer.var(axis=0, ddof=1)
    return np.asarray(
        np.divide(
            numerator, denominator, out=np.full_like(numerator, np.nan), where=denominator > 0
        ),
        dtype=float,
    )


def chen_bound(lead_periods: float, window: int) -> float:
    if (
        not np.isfinite(lead_periods)
        or lead_periods < 0
        or isinstance(lead_periods, bool)
        or isinstance(window, bool)
        or not isinstance(window, int)
        or window < 1
    ):
        raise ValueError("lead periods must be nonnegative and MA window a positive integer")
    return float(1 + 2 * lead_periods / window + 2 * (lead_periods / window) ** 2)


def echelon_series(net: BuiltNetwork, result: NetworkResult) -> dict[str, FloatArray]:
    # Suppliers receive DC orders; there is no further upstream purchasing echelon in this model.
    return {
        "customer_demand": result.demand.sum(axis=(1, 2)),
        "customer_orders": result.orders[:, :, net.customer_indices].sum(axis=(1, 2)),
        "dc_orders": result.orders[:, :, net.is_dc].sum(axis=(1, 2)),
        "supplier_orders_received": result.orders[:, :, net.is_dc].sum(axis=(1, 2)),
    }
