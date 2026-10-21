from math import sqrt

import numpy as np
from numpy.typing import ArrayLike

from ._validation import finite, nonnegative


def pooled_safety_stock(
    z: float, lead_time: float, daily_std: ArrayLike, correlation: ArrayLike
) -> float:
    """Pooled buffer for common deterministic lead time and daily demand correlations."""
    finite(z=z)
    nonnegative(lead_time=lead_time)
    sigma = np.asarray(daily_std, dtype=float)
    rho = np.asarray(correlation, dtype=float)
    if sigma.ndim != 1 or sigma.size == 0 or not np.all(np.isfinite(sigma)) or np.any(sigma < 0):
        raise ValueError("daily_std must be a nonempty vector of finite nonnegative values")
    if rho.shape != (sigma.size, sigma.size) or not np.all(np.isfinite(rho)):
        raise ValueError("correlation must be a finite square matrix matching daily_std")
    if (
        np.any(np.abs(rho) > 1)
        or not np.allclose(rho, rho.T, atol=1e-12, rtol=0)
        or not np.allclose(np.diag(rho), 1, atol=1e-12, rtol=0)
        or np.linalg.eigvalsh(rho).min() < -1e-10
    ):
        raise ValueError("correlation must be symmetric, unit-diagonal and positive semidefinite")
    variance = max(0.0, float(sigma @ rho @ sigma))
    return z * sqrt(lead_time) * sqrt(variance)
