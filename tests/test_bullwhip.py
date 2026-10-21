import numpy as np
import pytest

from scm.config.bullwhip import load_bullwhip
from scm.contracts import BullwhipConfig
from scm.metrics.bullwhip import aggregate_periods, bullwhip_ratio, chen_bound
from scm.policies.bullwhip import replenishment_order


def flags(**overrides: bool) -> BullwhipConfig:
    return BullwhipConfig.model_validate(dict(signal_processing=False, batching=False,
        price=False, rationing=False, pos_sharing=False) | overrides)


def test_weekly_aggregation_discards_warmup_then_incomplete_tail() -> None:
    values = np.arange(18, dtype=float)
    np.testing.assert_array_equal(aggregate_periods(values, warmup_days=2, period_days=7), [35, 84])
    assert bullwhip_ratio(values * 2, values, warmup_days=2) == pytest.approx(4)
    assert np.isnan(bullwhip_ratio(np.ones(21), np.ones(21)))
    with pytest.raises(ValueError):
        bullwhip_ratio(np.ones(7), np.ones(7))
    with pytest.raises(ValueError):
        aggregate_periods(values, period_days=0)
    assert chen_bound(5, 14) == pytest.approx(1 + 10/14 + 50/196)


def test_causes_change_orders_and_countermeasures_remove_their_cause() -> None:
    settings = load_bullwhip()
    args = dict(position=np.array([90.]), target=np.array([100.]), forecast=np.array([10.]),
                supply_fill=np.array([0.5]), moq=np.array([10.]), pack=np.array([5.]))
    def order(cause: BullwhipConfig, day: int = 0) -> float:
        return float(replenishment_order(**args, flags=cause, settings=settings, day=day)[0])
    assert order(flags()) == 10
    assert order(flags(batching=True), 1) == 0
    assert order(flags(batching=True)) == 40
    assert order(flags(price=True)) > 10
    settings.edlp = True
    assert order(flags(price=True)) == 10
    settings.edlp = False
    assert order(flags(rationing=True)) > 10
    settings.vmi = True
    assert order(flags(batching=True, rationing=True), 1) == 10


def test_smoothing_targets_post_demand_position_and_is_nonnegative() -> None:
    settings = load_bullwhip()
    settings.smoothing_alpha = 0.25
    actual = replenishment_order([80, 200], [100, 100], [10, 10], [1, 1], [1, 1], [1, 1],
                                 flags(), settings, 0)
    np.testing.assert_array_equal(actual, [12.5, 0])
    with pytest.raises(ValueError):
        type(settings).model_validate({**settings.model_dump(), "promo_days": settings.promo_period + 1})
