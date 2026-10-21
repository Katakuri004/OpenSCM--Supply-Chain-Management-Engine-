from math import hypot, sqrt

from scipy.optimize import brentq
from scipy.stats import norm

from ._validation import finite, nonnegative, positive, probability


def lead_time_std(
    daily_mean: float, daily_std: float, lead_time_mean: float, lead_time_std: float = 0
) -> float:
    """Demand standard deviation during lead time; independent daily demand and lead time."""
    nonnegative(
        daily_mean=daily_mean,
        daily_std=daily_std,
        lead_time_mean=lead_time_mean,
        lead_time_std=lead_time_std,
    )
    return hypot(sqrt(lead_time_mean) * daily_std, daily_mean * lead_time_std)


def z_for_csl(target_csl: float) -> float:
    probability(target_csl)
    return float(norm.ppf(target_csl))


def cycle_service_level(z: float) -> float:
    """Normal-model CSL for nonzero demand variance; not a simulated service metric."""
    finite(z=z)
    return float(norm.cdf(z))


def safety_stock(z: float, sigma_l: float) -> float:
    """Signed buffer in units; a service target below 50% can produce a negative buffer."""
    finite(z=z)
    nonnegative(sigma_l=sigma_l)
    return z * sigma_l


def reorder_point(daily_mean: float, lead_time_mean: float, z: float, sigma_l: float) -> float:
    nonnegative(daily_mean=daily_mean, lead_time_mean=lead_time_mean)
    return daily_mean * lead_time_mean + safety_stock(z, sigma_l)


def normal_loss(z: float) -> float:
    """Standard normal first-order loss E[(Z-z)+]."""
    finite(z=z)
    # Survival function preserves precision where 1 - cdf(z) rounds to zero.
    return max(0.0, float(norm.pdf(z) - z * norm.sf(z)))


def fill_rate(z: float, sigma_l: float, quantity: float) -> float:
    """Normal-loss approximation 1 - sigma_l*G(z)/Q; invalid negative rates raise."""
    nonnegative(sigma_l=sigma_l)
    positive(quantity=quantity)
    rate = 1 - sigma_l * normal_loss(z) / quantity
    if rate < 0:
        raise ValueError("normal-loss approximation gives negative fill rate for these inputs")
    return rate


def z_for_fill_rate(target: float, sigma_l: float, quantity: float) -> float:
    """Solve the normal-loss equation; deterministic demand needs no safety buffer."""
    probability(target)
    nonnegative(sigma_l=sigma_l)
    positive(quantity=quantity)
    if sigma_l == 0:
        return 0.0
    loss = (1 - target) * quantity / sigma_l
    positive(required_loss=loss)
    upper = 1.0
    while normal_loss(upper) > loss:
        upper *= 2
    return float(brentq(lambda z: normal_loss(z) - loss, -max(1.0, loss), upper))
