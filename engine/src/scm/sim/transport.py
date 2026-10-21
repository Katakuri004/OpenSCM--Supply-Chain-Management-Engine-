import numpy as np
from numpy.typing import ArrayLike

from scm.demand.generator import FloatArray


def freight(
    units: ArrayLike, distance: ArrayLike, ltl_rate: float, capacity: float, trip_cost: ArrayLike
) -> tuple[FloatArray, FloatArray, FloatArray]:
    """Cheapest daily lane consolidation; ties favor full trucks plus LTL residual."""
    volume, km, trip = np.broadcast_arrays(
        *[np.asarray(a, dtype=float) for a in (units, distance, trip_cost)]
    )
    if (
        not all(np.all(np.isfinite(a)) for a in (volume, km, trip))
        or np.any(volume < 0)
        or np.any(km < 0)
        or np.any(trip < 0)
        or not np.isfinite(ltl_rate)
        or ltl_rate < 0
        or not np.isfinite(capacity)
        or capacity <= 0
    ):
        raise ValueError("freight inputs must be nonnegative, finite, with positive truck capacity")
    full = np.floor(volume / capacity)
    remainder = volume - full * capacity
    mixed = full * trip + remainder * km * ltl_rate
    all_ftl = np.ceil(volume / capacity) * trip
    all_ltl = volume * km * ltl_rate
    choose_full = all_ftl < mixed
    cost = np.where(choose_full, all_ftl, mixed)
    trips = np.where(choose_full, np.ceil(volume / capacity), full)
    ltl = np.where(choose_full, 0, remainder)
    choose_ltl = all_ltl <= cost
    return (
        np.minimum(all_ltl, cost),
        np.where(choose_ltl, 0, trips),
        np.where(choose_ltl, volume, ltl),
    )
