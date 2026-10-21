from collections.abc import Callable
from math import sqrt

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from scm.analytics.discounts import all_units_discount
from scm.analytics.eoq import annual_cost, eoq
from scm.analytics.epq import epq
from scm.analytics.newsvendor import critical_ratio, normal_quantity
from scm.analytics.pooling import pooled_safety_stock
from scm.analytics.safety_stock import (
    cycle_service_level,
    fill_rate,
    lead_time_std,
    normal_loss,
    reorder_point,
    safety_stock,
    z_for_csl,
    z_for_fill_rate,
)


def test_eoq_and_epq_worked_example() -> None:
    # Hand-worked: 2*10000*50/4 = 250000; production at twice demand.
    assert eoq(10000, 50, 4) == 500
    assert annual_cost(500, 10000, 50, 4) == 2000
    assert epq(10000, 50, 4, 20000) == pytest.approx(707.1067811865)
    assert eoq(0, 50, 4) == annual_cost(0, 0, 50, 4) == epq(0, 50, 4, 20000) == 0


@settings(derandomize=True, max_examples=150)
@given(
    demand=st.floats(1, 1e6),
    setup=st.floats(0.01, 1e4),
    holding=st.floats(0.01, 1e3),
    multiplier=st.floats(0.01, 100),
)
def test_eoq_minimizes_annual_cost(
    demand: float, setup: float, holding: float, multiplier: float
) -> None:
    quantity = eoq(demand, setup, holding)
    optimal = annual_cost(quantity, demand, setup, holding)
    alternative = annual_cost(quantity * multiplier, demand, setup, holding)
    assert optimal <= alternative + 1e-9 * optimal


def test_discount_breakpoint_and_interior_optimum() -> None:
    result = all_units_discount(10000, 50, 0.2, [(0, 10), (1000, 9)])
    assert result.quantity == 1000
    assert result.unit_price == 9
    assert result.annual_cost == 91400  # purchase 90000 + ordering 500 + holding 900
    result = all_units_discount(10000, 50, 0.2, [(0, 10), (10000, 9.99)])
    assert result.quantity == pytest.approx(707.1067811865)
    assert result.unit_price == 10
    assert all_units_discount(0, 50, 0.2, [(0, 10)]).annual_cost == 0


def test_discount_agrees_with_independent_quantity_sweep() -> None:
    tiers = [(0, 10), (200, 9.8), (1000, 9)]
    result = all_units_discount(10000, 50, 0.2, tiers)
    quantities = np.linspace(1, 5000, 5000)
    prices = np.where(quantities >= 1000, 9, np.where(quantities >= 200, 9.8, 10))
    costs = 10000 * prices + 500000 / quantities + 0.1 * prices * quantities
    assert result.annual_cost <= float(costs.min()) + 1e-8


def test_safety_stock_and_service_worked_examples() -> None:
    assert lead_time_std(100, 20, 4, 0) == 40
    assert lead_time_std(100, 20, 4, 1) == pytest.approx(sqrt(11600))
    z = z_for_csl(0.95)
    assert z == pytest.approx(1.644853626951)
    assert cycle_service_level(z) == pytest.approx(0.95)
    assert safety_stock(z, 40) == pytest.approx(65.794145078)
    assert reorder_point(100, 4, z, 40) == pytest.approx(465.794145078)
    assert normal_loss(0) == pytest.approx(0.3989422804014327)
    assert normal_loss(2) == pytest.approx(0.0084907026168296)
    assert normal_loss(10) > 0
    assert fill_rate(0, 20, 100) == pytest.approx(0.9202115439197135)


@pytest.mark.parametrize("target", [0.01, 0.5, 0.95, 0.999999])
@pytest.mark.parametrize("sigma,quantity", [(20, 100), (1, 100000), (10000, 1)])
def test_fill_rate_solver_round_trip(target: float, sigma: float, quantity: float) -> None:
    z = z_for_fill_rate(target, sigma, quantity)
    assert fill_rate(z, sigma, quantity) == pytest.approx(target, abs=1e-9)


def test_deterministic_service() -> None:
    assert lead_time_std(100, 0, 4, 0) == 0
    assert reorder_point(100, 4, 0, 0) == 400
    assert z_for_fill_rate(0.95, 0, 100) == 0
    assert fill_rate(0, 0, 100) == 1


def test_newsvendor_mit_examples() -> None:
    # MIT 2.854 Inventory (2016), slides 29–30: r=1, c=.25/.75, s=0, mean=100, sd=10.
    assert critical_ratio(0.75, 0.25) == 0.75
    assert normal_quantity(100, 10, 0.75, 0.25) == pytest.approx(106.744897502)
    assert normal_quantity(100, 10, 0.25, 0.75) == pytest.approx(93.255102498)
    assert normal_quantity(100, 0, 1, 1) == 100
    assert normal_quantity(0, 10, 1, 9) == 0


@pytest.mark.parametrize("rho", [0, 0.3, 0.6, 1])
def test_pooling_matches_analytical_ratio(rho: float) -> None:
    correlation = np.full((4, 4), rho)
    np.fill_diagonal(correlation, 1)
    pooled = pooled_safety_stock(2, 4, [10, 10, 10, 10], correlation)
    assert pooled / 160 == pytest.approx(sqrt((1 + 3 * rho) / 4))
    assert pooled_safety_stock(2, 4, [10, 10], [[1, -1], [-1, 1]]) == 0


@pytest.mark.parametrize(
    "matrix",
    [
        [[1]],
        [[1, 0.5], [0, 1]],
        [[2, 0], [0, 1]],
        [[1, 2], [2, 1]],
        [[1, float("nan")], [float("nan"), 1]],
    ],
)
def test_invalid_correlation_rejected(matrix: list[list[float]]) -> None:
    with pytest.raises(ValueError):
        pooled_safety_stock(2, 4, [10, 10], matrix)


def test_non_positive_semidefinite_correlation_rejected() -> None:
    with pytest.raises(ValueError):
        pooled_safety_stock(2, 4, [10, 10, 10], [[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]])


@pytest.mark.parametrize("bad", [-1, float("nan"), float("inf")])
def test_invalid_scalar_inputs_rejected(bad: float) -> None:
    calls: tuple[Callable[[], float], ...] = (
        lambda: eoq(bad, 50, 4),
        lambda: epq(100, 50, 4, bad),
        lambda: lead_time_std(100, bad, 4, 1),
        lambda: fill_rate(0, bad, 100),
        lambda: normal_quantity(100, bad, 1, 1),
        lambda: pooled_safety_stock(2, 4, [bad], [[1]]),
    )
    for call in calls:
        with pytest.raises(ValueError):
            call()


def test_invalid_domains_rejected() -> None:
    calls: tuple[Callable[[], float], ...] = (
        lambda: eoq(100, 50, 0),
        lambda: annual_cost(0, 100, 50, 4),
        lambda: epq(100, 50, 4, 100),
        lambda: critical_ratio(0, 0),
        lambda: z_for_csl(1),
        lambda: z_for_fill_rate(1, 20, 100),
        lambda: fill_rate(0, 20, 0),
        lambda: fill_rate(-10, 100, 1),
    )
    for call in calls:
        with pytest.raises(ValueError):
            call()


@pytest.mark.parametrize(
    "tiers", [[], [(1, 10)], [(0, 10), (0, 9)], [(0, 10), (100, 11)], [(0, 0)]]
)
def test_invalid_discount_tiers_rejected(tiers: list[tuple[float, float]]) -> None:
    with pytest.raises(ValueError):
        all_units_discount(10000, 50, 0.2, tiers)
