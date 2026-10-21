from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

from scm.config.planning import SegmentationSettings
from scm.demand.generator import FloatArray


@dataclass(frozen=True)
class Segments:
    abc: NDArray[np.str_]
    xyz: NDArray[np.str_]
    cell: NDArray[np.str_]
    annual_value: FloatArray
    cv: FloatArray


def classify(history: ArrayLike, unit_cost: ArrayLike, settings: SegmentationSettings) -> Segments:
    """Classify SKU demand aggregated over customer nodes, using historical days only."""
    values, cost = np.asarray(history, dtype=float), np.asarray(unit_cost, dtype=float)
    if (
        values.ndim != 2
        or values.shape[0] < 2
        or values.shape[1] == 0
        or cost.shape != values.shape[1:]
        or not np.all(np.isfinite(values))
        or np.any(values < 0)
        or not np.all(np.isfinite(cost))
        or np.any(cost <= 0)
    ):
        raise ValueError("classification needs at least two days by SKU and positive unit costs")
    mean = values.mean(axis=0)
    annual = mean * cost * 365
    ranked = np.argsort(-annual, kind="stable")
    prior = np.cumsum(annual[ranked]) - annual[ranked]
    share = prior / annual.sum() if annual.sum() > 0 else np.ones_like(prior)
    abc = np.full(len(cost), "C")
    abc[ranked] = np.where(share < settings.abc_a, "A", np.where(share < settings.abc_b, "B", "C"))
    abc[annual == 0] = "C"
    cv = np.divide(values.std(axis=0), mean, out=np.full_like(mean, np.inf), where=mean > 0)
    xyz = np.where(cv < settings.xyz_x, "X", np.where(cv <= settings.xyz_y, "Y", "Z"))
    return Segments(abc, xyz, np.char.add(abc, xyz), annual, cv)
