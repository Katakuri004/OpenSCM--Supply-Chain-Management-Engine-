import numpy as np
from numpy.typing import ArrayLike

from scm.config.planning import ForecastSettings
from scm.demand.generator import FloatArray


class Forecaster:
    """One-step forecast across SKU/node axes; update only after observing the day."""

    def __init__(self, initial: ArrayLike, variance: ArrayLike, settings: ForecastSettings):
        self.settings = settings.model_copy(deep=True)
        self.level = np.asarray(initial, dtype=float).copy()
        self.variance = np.asarray(variance, dtype=float).copy()
        if (
            self.level.size == 0
            or self.level.shape != self.variance.shape
            or not np.all(np.isfinite(self.level))
            or np.any(self.level < 0)
            or not np.all(np.isfinite(self.variance))
            or np.any(self.variance < 0)
        ):
            raise ValueError(
                "initial forecasts and variance must be aligned finite nonnegative arrays"
            )
        self.trend = np.zeros_like(self.level)
        self.buffer = np.zeros((settings.window, *self.level.shape))
        self.count = 0

    @property
    def prediction(self) -> FloatArray:
        return np.asarray(np.maximum(0, self.level + self.trend), dtype=float)

    def update(self, observed: ArrayLike) -> None:
        values = np.asarray(observed, dtype=float)
        if (
            values.shape != self.level.shape
            or not np.all(np.isfinite(values))
            or np.any(values < 0)
        ):
            raise ValueError("observations must match the forecast axes and be finite/nonnegative")
        self.buffer[self.count % self.settings.window] = values
        self.count += 1
        window = self.buffer[: min(self.count, self.settings.window)]
        if len(window) >= 2:
            self.variance = window.var(axis=0)
        if self.settings.method == "moving_average":
            self.level = window.mean(axis=0)
        else:
            old = self.level
            self.level = self.settings.alpha * values + (1 - self.settings.alpha) * (
                old + self.trend
            )
            if self.settings.method == "holt":
                self.trend = (
                    self.settings.beta * (self.level - old) + (1 - self.settings.beta) * self.trend
                )
