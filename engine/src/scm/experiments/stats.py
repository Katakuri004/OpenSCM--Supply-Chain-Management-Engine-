from typing import TypedDict

import numpy as np
from scipy.stats import t


class Estimate(TypedDict):
    n: int
    missing: int
    mean: float | None
    low: float | None
    high: float | None


def estimate(values: list[float | None]) -> Estimate:
    sample = np.array([v for v in values if v is not None], dtype=float)
    if not np.all(np.isfinite(sample)):
        raise ValueError("statistics require finite values or explicit nulls")
    n = len(sample)
    mean = float(sample.mean()) if n else None
    width = float(t.ppf(0.975, n - 1) * sample.std(ddof=1) / np.sqrt(n)) if n > 1 else None
    return Estimate(
        n=n,
        missing=len(values) - n,
        mean=mean,
        low=mean - width if mean is not None and width is not None else None,
        high=mean + width if mean is not None and width is not None else None,
    )


def paired_difference(
    baseline: dict[int, float | None], treated: dict[int, float | None]
) -> Estimate:
    if baseline.keys() != treated.keys():
        raise ValueError("paired estimates require identical seeds")
    values: list[float | None] = []
    for seed in sorted(baseline):
        a, b = baseline[seed], treated[seed]
        values.append(None if a is None or b is None else b - a)
    return estimate(values)
