import numpy as np
from numpy.typing import ArrayLike

from scm.demand.generator import FloatArray


def error_metrics(actual: ArrayLike, predicted: ArrayLike) -> dict[str, FloatArray]:
    """Reduce day axis; error = actual - prior forecast; percentage metrics are fractions."""
    observed, forecast = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if (
        observed.ndim < 1
        or observed.size == 0
        or observed.shape != forecast.shape
        or not np.all(np.isfinite(observed))
        or not np.all(np.isfinite(forecast))
        or np.any(observed < 0)
        or np.any(forecast < 0)
    ):
        raise ValueError("actual and predicted must be aligned finite nonnegative observations")
    errors = observed - forecast
    absolute = np.abs(errors)
    mad = absolute.mean(axis=0)
    positive = observed > 0
    ratios = np.divide(absolute, observed, out=np.zeros_like(absolute), where=positive)

    def ratio(numerator: FloatArray, denominator: FloatArray) -> FloatArray:
        return np.asarray(
            np.divide(
                numerator, denominator, out=np.full_like(numerator, np.nan), where=denominator > 0
            ),
            dtype=float,
        )

    return {
        "mad": np.asarray(mad),
        "bias": np.asarray(errors.mean(axis=0)),
        "mape": ratio(ratios.sum(axis=0), positive.sum(axis=0).astype(float)),
        "wmape": ratio(absolute.sum(axis=0), observed.sum(axis=0)),
        "tracking_signal": ratio(errors.sum(axis=0), np.asarray(mad)),
    }
