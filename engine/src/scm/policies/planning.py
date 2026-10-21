"""Historical segmentation and causal replenishment targets; no measured-demand fitting."""

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy.special import ndtri

from scm.config.planning import PlanningSettings
from scm.demand.classify import classify
from scm.demand.generator import FloatArray
from scm.forecast.methods import Forecaster
from scm.network.builder import BuiltNetwork


class ReplenishmentPlanner:
    def __init__(self, net: BuiltNetwork, settings: PlanningSettings, history: ArrayLike):
        self.net = net
        self.settings = settings.model_copy(deep=True)
        values = np.asarray(history, dtype=float)
        skus, nodes = net.initial_stock.shape
        leaf = net.customer_indices
        if (
            values.ndim != 3
            or values.shape[0] < 2
            or values.shape[1:] != (skus, len(leaf))
            or not np.all(np.isfinite(values))
            or np.any(values < 0)
        ):
            raise ValueError("demand history requires at least two past days by SKU by customer")
        self.segments = classify(values.sum(axis=2), net.unit_cost, settings.segmentation)
        self.policy = np.full((skus, nodes), net.scenario.policy.default, dtype="U11")
        self.z = np.full((skus, nodes), ndtri(net.scenario.policy.target_csl))
        if settings.segmented:
            for cell, rule in settings.segmentation.cells.items():
                selected = self.segments.cell == cell
                self.policy[selected] = rule.policy
                self.z[selected] = ndtri(rule.target_csl)
        self.z += settings.safety_factor_offset
        for column, customer in zip(leaf, net.spec.customers):
            if customer.kind == "b2b":
                self.z[:, column] = np.maximum(self.z[:, column], ndtri(customer.target_csl))
        historical_orders = np.zeros((len(values), skus, nodes))
        np.add.at(
            historical_orders,
            (
                np.arange(len(values))[:, None, None],
                np.arange(skus)[None, :, None],
                net.parent[:, leaf][None],
            ),
            values,
        )
        # DC initialization uses historical customer consumption as a prior for future orders.
        dc_history = historical_orders[:, :, net.is_dc]
        self.customers = Forecaster(values[0], np.zeros_like(values[0]), settings.forecast)
        self.dcs = Forecaster(dc_history[0], np.zeros_like(dc_history[0]), settings.forecast)
        self.mean = np.zeros((skus, nodes))
        self.variance = np.zeros_like(self.mean)
        for day in range(len(values)):
            self.update(values[day], dc=False)
            self.update(dc_history[day], dc=True)
        self.lead = (
            np.where(net.lead_cv == 0, np.maximum(1, np.ceil(net.lead_mean)), net.lead_mean + 0.5)
            + net.delay_probability * net.delay_days
        )
        self.lead_variance = (net.lead_mean * net.lead_cv) ** 2 + net.delay_probability * (
            1 - net.delay_probability
        ) * net.delay_days**2
        self.initial_stock = (
            self.targets(np.ones(nodes, dtype=bool))[2] * net.spec.inventory.initial_stock_fraction
        )
        self.initial_stock[:, net.is_supplier] = 0

    def update(self, observed: FloatArray, *, dc: bool) -> None:
        model = self.dcs if dc else self.customers
        columns = np.flatnonzero(self.net.is_dc) if dc else self.net.customer_indices
        model.update(observed)
        self.mean[:, columns] = model.prediction
        self.variance[:, columns] = model.variance

    def targets(self, mask: NDArray[np.bool_]) -> tuple[FloatArray, FloatArray, FloatArray]:
        net = self.net
        mean, variance, z = self.mean[:, mask], self.variance[:, mask], self.z[:, mask]
        lead, lead_variance = (
            self.lead[net.edge_for[:, mask]],
            self.lead_variance[net.edge_for[:, mask]],
        )
        holding = net.unit_cost[:, None] * np.where(
            net.holding_rate[mask] > 0, net.holding_rate[mask], 1
        )
        q = np.sqrt(2 * mean * 365 * net.order_cost[mask] / holding)
        q = np.ceil(np.maximum(q, net.moq[:, mask]) / net.pack[:, mask]) * net.pack[:, mask]
        reorder = np.maximum(
            0, mean * lead + z * np.sqrt(lead * variance + mean**2 * lead_variance)
        )
        policy = self.policy[:, mask]
        review = np.where(policy == "RS", net.spec.inventory.review_days, 1)
        upper = np.maximum(
            reorder,
            mean * (lead + review)
            + z * np.sqrt((lead + review) * variance + mean**2 * lead_variance),
        )
        upper = np.where(np.isin(policy, ["QR", "sS"]), reorder + q, upper)
        return q, reorder, upper
