from typing import Literal

import numpy as np
import pytest
from scm.demand.generator import demand, draw_streams, lead_days, monthly_seasonality
from scm.sim.engine import SingleNodeConfig, simulate


def config(**changes: object) -> SingleNodeConfig:
    return SingleNodeConfig.model_validate(
        {
            "quantity": 10.0,
            "reorder_point": 5.0,
            "initial_on_hand": 5.0,
            "warmup_days": 0,
            "order_cost": 2.0,
            "unit_cost": 3.0,
            "annual_holding_cost": 3.65,
            "shortage_cost": 4.0,
            **changes,
        }
    )


def test_receive_backlog_then_current_demand_and_order() -> None:
    result = simulate(np.array([[8.0], [4.0], [1.0]]), np.ones((3, 1), dtype=int), config())
    np.testing.assert_allclose(result.on_hand[:, 0], [0, 3, 12])
    np.testing.assert_allclose(result.backorders[:, 0], [3, 0, 0])
    np.testing.assert_allclose(result.received[:, 0], [0, 10, 10])
    np.testing.assert_allclose(result.fulfilled[:, 0], [5, 7, 1])
    np.testing.assert_allclose(result.immediate[:, 0], [5, 4, 1])
    np.testing.assert_allclose(result.orders[:, 0], [10, 10, 0])
    assert result.costs["purchase"][0, 0] == 30
    assert result.costs["shortage"][0, 0] == 12
    assert result.fill_rate[0] == pytest.approx(10 / 13)
    assert result.completed_cycles[0] == result.successful_cycles[0] == 1


@pytest.mark.parametrize("lost_sales", [False, True])
def test_balance_pipeline_and_cost_invariants(lost_sales: bool) -> None:
    streams = draw_streams(42, 200, 3, 1)
    usage = demand(streams, [[8], [9], [10]], [[5], [4], [3]])[:, :, 0]
    leads = lead_days(streams.lead_uniform[:, :, 0], 3, 0.5)
    result = simulate(usage, leads, config(lost_sales=lost_sales))
    np.testing.assert_allclose(
        5 + np.cumsum(result.received - result.fulfilled, axis=0), result.on_hand, atol=1e-10
    )
    np.testing.assert_allclose(
        np.cumsum(usage - result.fulfilled - result.lost, axis=0), result.backorders, atol=1e-10
    )
    np.testing.assert_allclose(
        np.cumsum(result.orders - result.received, axis=0), result.on_order, atol=1e-10
    )
    np.testing.assert_allclose(result.total_cost, sum(result.costs.values()))
    due = np.arange(len(usage))[:, None] + leads
    columns = np.broadcast_to(np.arange(usage.shape[1]), usage.shape)
    within = due < len(usage)
    expected_receipts = np.zeros_like(usage)
    np.add.at(expected_receipts, (due[within], columns[within]), result.orders[within])
    np.testing.assert_allclose(result.received, expected_receipts)
    assert np.all(result.on_hand >= 0)
    assert np.all(result.backorders >= 0)
    assert np.all(result.backorders == 0) if lost_sales else np.all(result.lost == 0)


def test_daily_holding_integrates_stock_until_it_runs_out() -> None:
    result = simulate(np.array([[10.0]]), np.ones((1, 1), dtype=int), config())
    # Five units drain at ten units/day: area = 0.5 * 5 * 0.5 unit-days.
    assert result.average_inventory[0, 0] == 1.25
    assert result.costs["holding"][0, 0] == pytest.approx(0.0125)


def test_warmup_zero_demand_and_incomplete_cycles() -> None:
    result = simulate(np.zeros((5, 2)), np.full((5, 2), 100), config(warmup_days=2))
    assert np.all(np.isnan(result.fill_rate))
    assert np.all(np.isnan(result.cycle_service_level))
    assert np.all(result.orders == 0)  # Review is strictly below R, not at R.
    np.testing.assert_allclose(result.measured_cost, result.total_cost[2:].sum(axis=0))


def test_one_large_day_orders_multiple_fixed_lots() -> None:
    result = simulate(np.array([[40.0]]), np.array([[1000]]), config())
    assert result.orders[0, 0] == 40
    assert result.on_order[0, 0] == 40  # Beyond-horizon arrivals remain in transit.
    assert result.costs["ordering"][0, 0] == 8


def test_reproducible_streams_and_policy_independent_lead_draws() -> None:
    first, second = draw_streams(9, 100, 2, 2), draw_streams(9, 100, 2, 2)
    np.testing.assert_array_equal(first.own_normal, second.own_normal)
    np.testing.assert_array_equal(first.lead_uniform, second.lead_uniform)
    np.testing.assert_array_equal(first.lead_uniform[:, 0, :], first.lead_uniform[:, 1, :])
    before = first.lead_uniform.copy()
    demand(first, [[10, 10], [10, 10]], [[2, 2], [2, 2]], kind="gamma")
    np.testing.assert_array_equal(first.lead_uniform, before)
    assert not np.array_equal(first.lead_uniform, first.delay_uniform)
    usage = demand(first, [[10, 10], [10, 10]], [[2, 2], [2, 2]])[:, :, 0]
    leads = lead_days(first.lead_uniform[:, :, 0], 3, 0.3)
    a, b = simulate(usage, leads, config()), simulate(usage, leads, config())
    np.testing.assert_array_equal(a.total_cost, b.total_cost)
    np.testing.assert_array_equal(a.on_hand, b.on_hand)


def test_demand_moments_correlation_and_compound_orders() -> None:
    streams = draw_streams(123, 30000, 1, 2)
    normal = demand(streams, [[100, 100]], [[10, 10]], regional_rho=0.6)[:, 0, :]
    np.testing.assert_allclose(normal.mean(axis=0), 100, atol=0.2)
    assert np.asarray(np.corrcoef(normal.T))[0, 1] == pytest.approx(0.6, abs=0.015)
    slow = demand(streams, [[2, 2]], [[4, 4]], kind="gamma")
    assert slow.mean() == pytest.approx(2, abs=0.04)
    assert slow.std() == pytest.approx(4, abs=0.15)
    orders = demand(streams, [[20, 20]], [[10, 10]], kind="b2b", arrival_probability=0.2)
    assert (orders > 0).mean() == pytest.approx(0.2, abs=0.005)
    assert orders.mean() == pytest.approx(4, abs=0.1)


def test_season_trend_and_region_separation() -> None:
    streams = draw_streams(1, 3, 1, 2)
    actual = demand(streams, [[10, 20]], [[0, 0]], season=[1, 2, 1], trend=0.1)
    np.testing.assert_allclose(actual[:, 0, :], [[10, 20], [22, 44], [12, 24]])
    many = draw_streams(1, 10000, 1, 2)
    independent = demand(many, [[100, 100]], [[10, 10]], regional_rho=1, regions=[0, 1])
    assert abs(np.asarray(np.corrcoef(independent[:, 0, :].T))[0, 1]) < 0.03


def test_monthly_seasonality_boundaries_and_repeat() -> None:
    profile = monthly_seasonality(366, np.arange(1, 13))
    np.testing.assert_array_equal(profile[[0, 30, 31, 58, 59, 364, 365]], [1, 1, 2, 2, 3, 12, 1])
    np.testing.assert_array_equal(monthly_seasonality(3, np.arange(1, 13), 364), [12, 1, 1])


def test_replication_prefix_is_stable() -> None:
    from scm.sim.validate import samples

    small = samples(123, 50, 2, 10, 2, 3, 0.2)
    large = samples(123, 50, 3, 10, 2, 3, 0.2)
    for a, b in zip(small, large, strict=True):
        np.testing.assert_array_equal(a, b[:, :2])


@pytest.mark.parametrize(
    "mean,std,rho,kind",
    [
        (-1, 1, 0, "normal"),
        (1, -1, 0, "normal"),
        (1, 1, 1.1, "normal"),
        (1, 1, float("nan"), "normal"),
        (0, 1, 0, "gamma"),
        (1, 1, 0.2, "b2b"),
    ],
)
def test_invalid_demand_models(
    mean: float, std: float, rho: float, kind: Literal["normal", "gamma", "b2b"]
) -> None:
    with pytest.raises(ValueError):
        demand(draw_streams(1, 2, 1, 1), [[mean]], [[std]], regional_rho=rho, kind=kind)


@pytest.mark.parametrize("uniform", [float("nan"), -0.1, 1.0])
def test_invalid_lead_uniforms(uniform: float) -> None:
    with pytest.raises(ValueError):
        lead_days([[uniform]], 3, 0.5)


@pytest.mark.parametrize(
    "usage,leads",
    [
        (np.array([1.0]), np.array([1])),
        (np.array([[-1.0]]), np.array([[1]])),
        (np.array([[np.nan]]), np.array([[1]])),
        (np.ones((1, 1)), np.array([[0]])),
        (np.ones((1, 1)), np.array([[1.5]])),
        (np.ones((2, 1)), np.ones((1, 1))),
    ],
)
def test_invalid_inputs_rejected(usage: np.ndarray, leads: np.ndarray) -> None:
    with pytest.raises(ValueError):
        simulate(usage, leads, config())
