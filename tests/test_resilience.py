import numpy as np
import pytest
from scm.metrics.resilience import service_resilience


def test_fractional_survival_matches_stock_divided_by_demand() -> None:
    demand = np.full((12, 1, 1), 10.0)
    served = np.array([10, 10, 5, 0, 0, 10, 10, 10, 10, 10, 10, 10])[:, None, None]
    result = service_resilience(
        demand,
        served,
        demand,
        demand,
        np.ones((1, 1), dtype=bool),
        start_day=0,
        window=7,
        tolerance=0.01,
    )
    assert result["tts_days"] == 25 / 10
    assert result["ttr_days"] == 12  # Seven complete healthy days, observed at day 11 close.


def test_recovery_waits_for_delayed_service_loss_and_reports_censoring() -> None:
    demand = np.full((20, 1, 1), 10.0)
    served = demand.copy()
    served[10:] = 0
    result = service_resilience(
        demand,
        served,
        demand,
        demand,
        np.ones((1, 1), dtype=bool),
        start_day=2,
        window=7,
        tolerance=0.01,
    )
    assert result["tts_days"] == 8
    assert result["ttr_days"] is None
    healthy = service_resilience(
        demand,
        demand,
        demand,
        demand,
        np.ones((1, 1), dtype=bool),
        start_day=2,
        window=7,
        tolerance=0.01,
    )
    assert healthy["tts_days"] is None
    assert healthy["ttr_days"] == 0
    with pytest.raises(ValueError):
        service_resilience(
            demand,
            demand,
            demand,
            demand,
            np.zeros((1, 1), dtype=bool),
            start_day=2,
            window=7,
            tolerance=0.01,
        )


def test_recovery_uses_volume_weighted_fill_and_affected_scope() -> None:
    demand = np.full((12, 1, 2), 10.0)
    served = demand.copy()
    served[:, :, 1] = 0
    result = service_resilience(
        demand,
        served,
        demand,
        demand,
        np.array([[True, False]]),
        start_day=1,
        window=7,
        tolerance=0.01,
    )
    assert result["tts_days"] is None and result["ttr_days"] == 0


def test_network_survival_matches_analytic_check() -> None:
    from scm.experiments.e6_validate import analytic_check, load_validation

    result = analytic_check(load_validation())
    assert result["passed"]
    assert result["observed_tts_days"] == result["analytic_tts_days"] == 2.5
