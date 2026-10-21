import numpy as np
from numpy.typing import ArrayLike

from scm.config.bullwhip import BullwhipSettings
from scm.contracts import BullwhipConfig
from scm.demand.generator import FloatArray
from scm.network.builder import BuiltNetwork


def nominal_demand(net: BuiltNetwork) -> FloatArray:
    mean = np.zeros_like(net.initial_stock)
    leaf = net.customer_indices
    mean[:, leaf] = np.array([s.daily_mean for s in net.spec.skus])[:, None] * np.array(
        [c.demand_scale * c.arrival_probability for c in net.spec.customers]
    )
    np.add.at(mean, (np.arange(len(net.spec.skus))[:, None], net.parent[:, leaf]), mean[:, leaf])
    return mean


def replenishment_order(
    position: ArrayLike,
    target: ArrayLike,
    forecast: ArrayLike,
    supply_fill: ArrayLike,
    moq: ArrayLike,
    pack: ArrayLike,
    flags: BullwhipConfig,
    settings: BullwhipSettings,
    day: int,
) -> FloatArray:
    ip, upper, mean, fill, minimum, packs = np.broadcast_arrays(
        *[np.asarray(v, dtype=float) for v in (position, target, forecast, supply_fill, moq, pack)]
    )
    if (
        not all(np.all(np.isfinite(v)) for v in (ip, upper, mean, fill, minimum, packs))
        or np.any(upper < 0)
        or np.any(mean < 0)
        or np.any((fill < 0) | (fill > 1))
        or np.any(minimum <= 0)
        or np.any(packs <= 0)
        or isinstance(day, bool)
        or not isinstance(day, int)
        or day < 0
    ):
        raise ValueError("invalid bullwhip policy inputs")
    batching = flags.batching and not settings.vmi
    if batching and day % settings.batch_days:
        return np.zeros_like(ip)
    if flags.price and settings.promotion(day):
        upper = upper + mean * settings.forward_buy_days
    # The desired post-demand position is upper minus one day's expected demand.
    ordered = np.maximum(0, mean + settings.smoothing_alpha * (upper - mean - ip))
    if flags.rationing and not settings.vmi:
        ordered *= 1 + settings.rationing_gain * np.maximum(0, settings.rationing_threshold - fill)
    if batching:
        lot = np.ceil(minimum / packs) * packs * settings.batch_multiple
        ordered = np.ceil(ordered / lot) * lot
    return np.asarray(ordered, dtype=float)
