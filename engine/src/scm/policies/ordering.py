import numpy as np
from numpy.typing import ArrayLike

from scm.demand.generator import FloatArray


def order_quantity(
    position: ArrayLike,
    kind: ArrayLike,
    quantity: ArrayLike,
    reorder: ArrayLike,
    order_up_to: ArrayLike,
    review_days: int,
    day: int,
    moq: ArrayLike,
    pack: ArrayLike,
) -> FloatArray:
    ip, q, r, upper, minimum, pack_size = np.broadcast_arrays(
        *[np.asarray(x, dtype=float) for x in (position, quantity, reorder, order_up_to, moq, pack)]
    )
    if not all(np.all(np.isfinite(a)) for a in (ip, q, r, upper, minimum, pack_size)):
        raise ValueError("policy inputs must be finite")
    if (
        np.any(q <= 0)
        or np.any(minimum <= 0)
        or np.any(pack_size <= 0)
        or np.any(r < 0)
        or np.any(upper < r)
    ):
        raise ValueError("require Q/MOQ/pack > 0 and order-up-to >= reorder >= 0")
    if (
        isinstance(review_days, bool)
        or not isinstance(review_days, int)
        or review_days < 1
        or isinstance(day, bool)
        or not isinstance(day, int)
        or day < 0
    ):
        raise ValueError("review days must be positive and day nonnegative integers")
    lot = np.ceil(np.maximum(q, minimum) / pack_size) * pack_size
    policy = np.broadcast_to(np.asarray(kind), ip.shape)
    if not np.all(np.isin(policy, ["QR", "sS", "RS", "order_up_to"])):
        raise ValueError("unknown inventory policy")
    requested = np.select(
        [
            policy == "QR",
            policy == "sS",
            (policy == "order_up_to") | ((policy == "RS") & (day % review_days == 0)),
        ],
        [
            np.maximum(0, np.ceil((r - ip) / lot)) * lot,
            np.where(ip < r, upper - ip, 0),
            np.maximum(0, upper - ip),
        ],
        default=0,
    )
    return np.asarray(
        np.where(requested > 0, np.ceil(np.maximum(requested, minimum) / pack_size) * pack_size, 0),
        dtype=float,
    )
