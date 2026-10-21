"""Unconstrained single-stage order-up-to benchmark using Chen's period convention."""

import numpy as np
from numpy.typing import ArrayLike

from scm.config.planning import ForecastSettings
from scm.demand.generator import FloatArray
from scm.forecast.methods import Forecaster
from scm.metrics.bullwhip import chen_bound


def order_process(
    demand: ArrayLike,
    *,
    lead_periods: float,
    window: int,
    initial_mean: float,
    initial_std: float,
    safety_factor: float,
    known_demand: bool = False,
) -> FloatArray:
    usage = np.asarray(demand, dtype=float)
    chen_bound(lead_periods, window)
    if (
        usage.ndim != 2
        or min(usage.shape) == 0
        or not np.all(np.isfinite(usage))
        or not np.all(np.isfinite([initial_mean, initial_std, safety_factor]))
        or min(initial_mean, initial_std, safety_factor) < 0
    ):
        raise ValueError(
            "require finite day-by-replication demand and nonnegative initial moments/z"
        )
    mean = np.full(usage.shape[1], initial_mean)
    model = Forecaster(
        mean,
        np.full_like(mean, initial_std**2),
        ForecastSettings(method="moving_average", window=window, alpha=1, beta=0),
    )
    errors = np.zeros((window, usage.shape[1]))
    error_std = np.full_like(mean, initial_std * np.sqrt(1 + 1 / window))
    # IID lead-period forecast error / one-step forecast error standard deviation.
    scale = np.sqrt((lead_periods + lead_periods**2 / window) / (1 + 1 / window))
    initial_target = lead_periods * mean + safety_factor * scale * error_std
    position = initial_target.copy()
    orders = np.zeros_like(usage)
    for day in range(len(usage)):
        forecast = mean if known_demand else model.prediction
        target = (
            initial_target
            if known_demand
            else lead_periods * forecast + safety_factor * scale * error_std
        )
        orders[day] = target - position
        position += orders[day] - usage[day]
        if not known_demand:
            errors[day % window] = usage[day] - forecast
            error_std = np.sqrt((errors[: min(day + 1, window)] ** 2).mean(axis=0))
            model.update(usage[day])
    return orders
