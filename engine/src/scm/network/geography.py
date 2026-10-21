import numpy as np
from numpy.typing import ArrayLike

from scm.demand.generator import FloatArray


def haversine_km(origins: ArrayLike, destinations: ArrayLike) -> FloatArray:
    """Great-circle distances on a spherical Earth of radius 6371 km."""
    a, b = np.asarray(origins, dtype=float), np.asarray(destinations, dtype=float)
    for points in (a, b):
        if (
            points.ndim != 2
            or points.shape[1] != 2
            or not np.all(np.isfinite(points))
            or np.any(np.abs(points[:, 0]) > 90)
            or np.any(np.abs(points[:, 1]) > 180)
        ):
            raise ValueError("coordinates must be finite (latitude, longitude) pairs")
    a, b = np.radians(a), np.radians(b)
    delta = a[:, None, :] - b[None, :, :]
    h = (
        np.sin(delta[:, :, 0] / 2) ** 2
        + np.cos(a[:, None, 0]) * np.cos(b[None, :, 0]) * np.sin(delta[:, :, 1] / 2) ** 2
    )
    return np.asarray(2 * 6371 * np.arcsin(np.sqrt(np.clip(h, 0, 1))), dtype=float)
