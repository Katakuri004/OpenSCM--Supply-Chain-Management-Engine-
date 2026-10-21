from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy.special import ndtr
from scipy.stats import gamma

from scm.analytics._validation import finite, nonnegative, positive

FloatArray = NDArray[np.float64]


def monthly_seasonality(days: int, monthly_index: ArrayLike, start_day: int = 0) -> FloatArray:
    """Repeat a non-leap 365-day calendar; day zero is January 1."""
    if (
        isinstance(days, bool)
        or not isinstance(days, int)
        or days < 1
        or isinstance(start_day, bool)
        or not isinstance(start_day, int)
        or start_day < 0
    ):
        raise ValueError("days must be positive and start_day nonnegative integers")
    indices = np.asarray(monthly_index, dtype=float)
    if indices.shape != (12,) or not np.all(np.isfinite(indices)) or np.any(indices < 0):
        raise ValueError("monthly_index must contain twelve nonnegative finite multipliers")
    boundaries = np.cumsum([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    month = np.searchsorted(boundaries, (np.arange(days) + start_day) % 365, side="right")
    return indices[month]


@dataclass(frozen=True)
class Streams:
    own_normal: FloatArray
    region_normal: FloatArray
    lead_uniform: FloatArray
    delay_uniform: FloatArray
    b2b_uniform: FloatArray
    b2b_normal: FloatArray


def draw_streams(seed: int, days: int, skus: int, nodes: int) -> Streams:
    """Stable axes: (day, SKU, node/edge); reuse the same shape and IDs across scenarios."""
    if any(isinstance(x, bool) or not isinstance(x, int) or x < 1 for x in (days, skus, nodes)):
        raise ValueError("days, skus and nodes must be positive integers")
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a nonnegative integer")
    demand_rng, lead_rng, delay_rng, b2b_rng = (
        np.random.default_rng(child) for child in np.random.SeedSequence(seed).spawn(4)
    )
    shape = (days, skus, nodes)
    return Streams(
        demand_rng.standard_normal(shape),
        demand_rng.standard_normal(shape),
        np.broadcast_to(lead_rng.random((days, 1, nodes)), shape),
        np.broadcast_to(delay_rng.random((days, 1, nodes)), shape),
        b2b_rng.random(shape),
        b2b_rng.standard_normal(shape),
    )


def demand(
    streams: Streams,
    mean: ArrayLike,
    std: ArrayLike,
    *,
    regional_rho: float = 0,
    regions: ArrayLike | None = None,
    trend: float = 0,
    season: ArrayLike | None = None,
    kind: Literal["normal", "gamma", "b2b"] = "normal",
    arrival_probability: float = 1,
) -> FloatArray:
    """Mean/std are SKU × node; B2B moments describe conditional order size, not daily totals."""
    days, skus, nodes = streams.own_normal.shape
    base, sigma = np.asarray(mean, dtype=float), np.asarray(std, dtype=float)
    if base.shape != (skus, nodes) or sigma.shape != base.shape:
        raise ValueError("mean and std must have shape (SKU, node)")
    if not np.all(np.isfinite([base, sigma])) or np.any(base < 0) or np.any(sigma < 0):
        raise ValueError("demand moments must be finite and nonnegative")
    finite(regional_rho=regional_rho, trend=trend, arrival_probability=arrival_probability)
    if not 0 <= regional_rho <= 1 or not 0 <= arrival_probability <= 1:
        raise ValueError("correlation and arrival probability must lie in [0, 1]")
    region = np.zeros(nodes, dtype=int) if regions is None else np.asarray(regions)
    if (
        region.shape != (nodes,)
        or not np.issubdtype(region.dtype, np.integer)
        or np.any(region < 0)
        or np.any(region >= nodes)
    ):
        raise ValueError("regions must be integer indices in [0, nodes)")
    seasonal = np.ones(days) if season is None else np.asarray(season, dtype=float)
    if seasonal.shape != (days,) or not np.all(np.isfinite(seasonal)) or np.any(seasonal < 0):
        raise ValueError("season must contain one nonnegative finite multiplier per day")
    factor = (1 + trend * np.arange(days)) * seasonal
    if np.any(factor < 0):
        raise ValueError("trend must not imply negative mean demand")
    mu = base[None, :, :] * factor[:, None, None]
    z = (
        np.sqrt(regional_rho) * streams.region_normal[:, :, region]
        + np.sqrt(1 - regional_rho) * streams.own_normal
    )
    if kind == "normal":
        return np.asarray(np.maximum(0, mu + sigma * z), dtype=float)
    if np.any((mu == 0) & (sigma > 0)):
        raise ValueError("gamma/B2B positive variability requires a positive mean")
    safe_sigma = np.where(sigma > 0, sigma, 1)
    safe_mu = np.where(mu > 0, mu, 1)
    if kind == "gamma":
        uniform = np.clip(ndtr(z), np.finfo(float).eps, 1 - np.finfo(float).eps)
        draws = gamma.ppf(uniform, (safe_mu / safe_sigma) ** 2, scale=safe_sigma**2 / safe_mu)
        return np.asarray(np.where(sigma > 0, draws, mu), dtype=float)
    if kind == "b2b":
        # shortcut: one B2B order per SKU-node-day; use compound Poisson for intraday order counts.
        if regional_rho != 0:
            raise ValueError(
                "B2B arrivals and order sizes are independent; regional_rho must be zero"
            )
        log_variance = np.log1p((sigma / safe_mu) ** 2)
        size = np.exp(
            np.log(safe_mu) - log_variance / 2 + np.sqrt(log_variance) * streams.b2b_normal
        )
        return np.where(streams.b2b_uniform < arrival_probability, np.where(mu > 0, size, 0), 0)
    raise ValueError("unknown demand kind")


def lead_days(uniform: ArrayLike, mean: float, cv: float) -> NDArray[np.int64]:
    """Gamma lead times rounded upward to daily buckets, with a minimum of one day."""
    positive(mean=mean)
    nonnegative(cv=cv)
    values = np.asarray(uniform, dtype=float)
    if not np.all(np.isfinite(values)) or np.any(values < 0) or np.any(values >= 1):
        raise ValueError("lead uniforms must lie in [0, 1)")
    draws = (
        np.full_like(values, mean)
        if cv == 0
        else gamma.ppf(
            np.clip(values, np.finfo(float).eps, 1 - np.finfo(float).eps),
            1 / cv**2,
            scale=mean * cv**2,
        )
    )
    if not np.all(np.isfinite(draws)) or np.any(draws >= np.iinfo(np.int64).max / 2):
        raise ValueError("lead time exceeds the supported integer range")
    return np.maximum(1, np.ceil(draws)).astype(np.int64)
