import numpy as np
from scm.experiments.e4_validate import load_validation, validate_theory
from scm.sim.bullwhip_reference import order_process


def test_inventory_position_reference_matches_chen_identity() -> None:
    usage = np.array([100, 110, 90, 105, 120, 95, 100, 108], dtype=float)[:, None]
    orders = order_process(
        usage, lead_periods=2, window=3, initial_mean=100, initial_std=5, safety_factor=0
    )
    expected = (1 + 2 / 3) * usage[3:-1] - (2 / 3) * usage[:-4]
    np.testing.assert_allclose(orders[4:], expected)
    known = order_process(
        usage,
        lead_periods=2,
        window=3,
        initial_mean=100,
        initial_std=5,
        safety_factor=0,
        known_demand=True,
    )
    np.testing.assert_allclose(known[1:], usage[:-1])


def test_v7_daily_chen_bound_and_known_demand_control() -> None:
    results = validate_theory(load_validation())
    assert all(row["passed"] for row in results)
    assert all(row["observed_ratio"] >= row["bound"] for row in results)
