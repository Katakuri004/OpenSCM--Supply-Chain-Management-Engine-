"""Affected-customer service survival and recovery in elapsed days."""

import numpy as np
from numpy.typing import ArrayLike

from scm.contracts import Disruption
from scm.demand.generator import FloatArray
from scm.network.builder import BuiltNetwork
from scm.sim.disruptions import affected_customers
from scm.sim.multi_echelon import NetworkResult


def rolling_fill(demand: FloatArray, served: FloatArray, window: int) -> FloatArray:
    cumulative_demand = np.r_[0.0, np.cumsum(demand)]
    cumulative_served = np.r_[0.0, np.cumsum(served)]
    denominator = cumulative_demand[window:] - cumulative_demand[:-window]
    numerator = cumulative_served[window:] - cumulative_served[:-window]
    return np.asarray(
        np.r_[
            np.full(window - 1, np.nan),
            np.divide(
                numerator, denominator, out=np.full_like(numerator, np.nan), where=denominator > 0
            ),
        ],
        dtype=float,
    )


def service_resilience(
    demand: ArrayLike,
    immediate: ArrayLike,
    baseline_demand: ArrayLike,
    baseline_immediate: ArrayLike,
    affected: ArrayLike,
    *,
    start_day: int,
    window: int,
    tolerance: float,
) -> dict[str, float | None]:
    usage, served, base, base_served = (
        np.asarray(v, dtype=float) for v in (demand, immediate, baseline_demand, baseline_immediate)
    )
    mask = np.asarray(affected)
    if (
        usage.ndim != 3
        or min(usage.shape) < 1
        or any(
            v.shape != usage.shape or not np.all(np.isfinite(v)) or np.any(v < 0)
            for v in (usage, served, base, base_served)
        )
        or np.any(served > usage + 1e-8)
        or np.any(base_served > base + 1e-8)
        or mask.shape != usage.shape[1:]
        or mask.dtype != np.bool_
        or not mask.any()
        or isinstance(start_day, bool)
        or not isinstance(start_day, int)
        or not 0 <= start_day < len(usage)
        or isinstance(window, bool)
        or not isinstance(window, int)
        or not 1 <= window <= len(usage)
        or not np.isfinite(tolerance)
        or not 0 <= tolerance <= 1
    ):
        raise ValueError(
            "invalid aligned resilience series, affected scope, or measurement settings"
        )
    fraction = np.divide(served, usage, out=np.ones_like(usage), where=usage > 0)
    shortage = (usage - served > 1e-8) & mask[None]
    first = np.flatnonzero(shortage[start_day:].any(axis=(1, 2)))
    tts = None
    if len(first):
        day = start_day + int(first[0])
        tts = float(first[0] + fraction[day][shortage[day]].min())
    fill = rolling_fill(usage[:, mask].sum(axis=1), served[:, mask].sum(axis=1), window)
    reference = rolling_fill(base[:, mask].sum(axis=1), base_served[:, mask].sum(axis=1), window)
    valid = np.isfinite(fill) & np.isfinite(reference) & (np.arange(len(usage)) >= start_day)
    breach = np.flatnonzero(valid & (fill < reference - tolerance))
    ttr: float | None = None
    if len(breach):
        # Never call early stock coverage recovery: search after the first observed service breach.
        recovered = np.flatnonzero(
            valid
            & (np.arange(len(usage)) > breach[0])
            & (np.arange(len(usage)) >= start_day + window - 1)
            & (fill >= reference - tolerance)
        )
        if len(recovered):
            ttr = float(recovered[0] + 1 - start_day)
    elif valid.any():
        ttr = 0.0
    return {"tts_days": tts, "ttr_days": ttr}


def paired_resilience(
    net: BuiltNetwork,
    result: NetworkResult,
    baseline: NetworkResult,
    event: Disruption,
    *,
    window: int,
    tolerance: float,
) -> dict[str, float | None]:
    if result.warmup_days != baseline.warmup_days:
        raise ValueError("paired runs must have the same warm-up")
    leaf = net.customer_indices
    metrics = service_resilience(
        result.demand,
        result.immediate[:, :, leaf],
        baseline.demand,
        baseline.immediate[:, :, leaf],
        affected_customers(net, event.target),
        start_day=event.start_day,
        window=window,
        tolerance=tolerance,
    )
    measured = slice(event.start_day, None)
    metrics.update(
        disruption_cost_inr=float(
            (result.total_cost[measured] - baseline.total_cost[measured]).sum()
        ),
        lost_sales_units=float(result.lost[measured].sum()),
        extra_lost_sales_units=float((result.lost[measured] - baseline.lost[measured]).sum()),
    )
    return metrics
