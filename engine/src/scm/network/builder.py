"""Fixed sourcing and known-demand inventory targets for the M3 network."""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy.special import ndtri

from scm.config.models import NetworkSpec
from scm.contracts import Edges, Network, Nodes, NodeType, Scenario
from scm.demand.generator import FloatArray
from scm.network.facility_location import k_median
from scm.network.geography import haversine_km

IntArray = NDArray[np.int64]


@dataclass
class BuiltNetwork:
    spec: NetworkSpec
    scenario: Scenario
    nodes: Nodes
    source: IntArray
    target: IntArray
    distance: FloatArray
    canonical_edge: IntArray
    canonical_edge_count: int
    parent: IntArray
    edge_for: IntArray
    customer_indices: IntArray
    is_supplier: NDArray[np.bool_]
    is_dc: NDArray[np.bool_]
    quantity: FloatArray
    reorder: FloatArray
    upper: FloatArray
    moq: FloatArray
    pack: FloatArray
    initial_stock: FloatArray
    capacity: FloatArray
    unit_cost: FloatArray
    holding_rate: FloatArray
    order_cost: FloatArray
    fixed_cost: FloatArray
    handling_cost: FloatArray
    shortage_penalty: FloatArray
    lead_mean: FloatArray
    lead_cv: FloatArray
    delay_probability: FloatArray
    delay_days: IntArray

    @property
    def node_ids(self) -> list[str]:
        return self.nodes.id

    def as_contract(self, run_id: str) -> Network:
        return Network(
            run_id=run_id,
            nodes=self.nodes,
            edges=Edges(
                id=[
                    f"{self.node_ids[a]}_{self.node_ids[b]}"
                    for a, b in zip(self.source, self.target)
                ],
                source=[self.node_ids[a] for a in self.source],
                target=[self.node_ids[b] for b in self.target],
                distance_km=self.distance.tolist(),
                flow_units=[0.0] * len(self.source),
            ),
        )


def build_network(spec: NetworkSpec, scenario: Scenario) -> BuiltNetwork:
    """Select DCs by demand-distance, then set fixed policy parameters (forecasts start in M4)."""
    if scenario.disruptions:
        raise ValueError("disruptions are not supported until M6")
    known = {s.id for s in spec.suppliers}
    selected = set(scenario.network.suppliers)
    if not selected <= known or not {s.supplier for s in spec.skus} <= selected:
        raise ValueError("selected suppliers must include every SKU's primary supplier")
    suppliers = [s for s in spec.suppliers if s.id in selected]
    customers = spec.customers
    customer_coords = [[c.latitude, c.longitude] for c in customers]
    distance = haversine_km([[d.latitude, d.longitude] for d in spec.dcs], customer_coords)
    weights = np.array([c.demand_scale * c.arrival_probability for c in customers])
    chosen = k_median(distance, weights, scenario.network.dc_count)
    dcs = [spec.dcs[i] for i in chosen]
    ns, nd, nc, skus = len(suppliers), len(dcs), len(customers), len(spec.skus)
    sites = [*suppliers, *dcs, *customers]
    count = len(sites)
    kinds: list[NodeType] = ["supplier"] * ns
    kinds.extend(["dc"] * nd)
    kinds.extend(c.kind for c in customers)
    nodes = Nodes(
        id=[s.id for s in sites],
        label=[s.label for s in sites],
        type=kinds,
        latitude=[s.latitude for s in sites],
        longitude=[s.longitude for s in sites],
    )
    leaf = np.arange(ns + nd, count, dtype=np.int64)
    is_supplier = np.arange(count) < ns
    is_dc = (np.arange(count) >= ns) & (np.arange(count) < ns + nd)
    assigned = np.argmin(distance[chosen], axis=0)
    source = np.concatenate([np.repeat(np.arange(ns), nd), ns + assigned]).astype(np.int64)
    target = np.concatenate([np.tile(np.arange(ns, ns + nd), ns), leaf]).astype(np.int64)
    supplier_master = np.array([spec.suppliers.index(s) for s in suppliers])
    canonical = np.concatenate(
        [
            (supplier_master[:, None] * len(spec.dcs) + chosen).ravel(),
            len(spec.suppliers) * len(spec.dcs) + chosen[assigned] * nc + np.arange(nc),
        ]
    ).astype(np.int64)
    coordinates = np.column_stack([nodes.latitude, nodes.longitude])
    lanes = haversine_km(coordinates, coordinates)[source, target] * spec.transport.circuity
    primary = np.array([nodes.id.index(s.supplier) for s in spec.skus])
    parent = np.full((skus, count), -1, dtype=np.int64)
    parent[:, is_dc] = primary[:, None]
    parent[:, leaf] = ns + assigned
    edge_for = np.zeros_like(parent)
    edge_for[:, is_dc] = primary[:, None] * nd + np.arange(nd)
    edge_for[:, leaf] = ns * nd + np.arange(nc)
    lead_mean = np.concatenate(
        [
            np.repeat([s.lead_mean for s in suppliers], nd),
            np.full(nc, spec.transport.outbound_handling_days),
        ]
    )
    lead_mean += lanes / spec.transport.km_per_day
    lead_mean = np.maximum(lead_mean, np.finfo(float).eps)
    lead_cv = np.concatenate(
        [
            np.repeat([s.lead_cv for s in suppliers], nd),
            np.full(nc, spec.transport.outbound_lead_cv),
        ]
    )
    delay_probability = np.concatenate(
        [np.repeat([s.delay_probability for s in suppliers], nd), np.zeros(nc)]
    )
    delay_days = np.concatenate(
        [np.repeat([s.delay_days for s in suppliers], nd), np.zeros(nc, dtype=int)]
    ).astype(np.int64)
    capacity = np.array(
        [s.daily_capacity for s in suppliers] + [d.daily_capacity for d in dcs] + [0.0] * nc
    )
    unit_cost = np.array(
        [s.unit_cost * suppliers[primary[i]].price_multiplier for i, s in enumerate(spec.skus)]
    )
    holding = np.array(
        [0.0] * ns + [d.holding_rate for d in dcs] + [spec.inventory.customer_holding_rate] * nc
    )
    order_cost = np.array(
        [0.0] * ns + [spec.inventory.dc_order_cost] * nd + [spec.inventory.customer_order_cost] * nc
    )
    fixed = np.array([0.0] * ns + [d.annual_fixed_cost / 365 for d in dcs] + [0.0] * nc)
    handling = np.array([0.0] * ns + [d.handling_cost for d in dcs] + [0.0] * nc)
    penalties = np.array([0.0] * (ns + nd) + [c.shortage_penalty for c in customers])
    base = np.array([s.daily_mean for s in spec.skus])[:, None] * np.array(
        [c.demand_scale for c in customers]
    )
    sigma = base * np.array([s.cv for s in spec.skus])[:, None] * scenario.demand.cv_scale
    probability = np.array([c.arrival_probability for c in customers])
    mean_leaf = base * probability
    variance_leaf = probability * sigma**2 + probability * (1 - probability) * base**2
    assignment = np.eye(nd)[assigned]
    means = np.zeros((skus, count))
    variances = np.zeros_like(means)
    means[:, leaf], variances[:, leaf] = mean_leaf, variance_leaf
    means[:, is_dc] = mean_leaf @ assignment
    regions = np.array([c.region for c in customers])
    retail = np.array([c.kind == "retailer" for c in customers])
    correlation = scenario.demand.regional_rho * (
        (regions[:, None] == regions) & retail[:, None] & retail
    )
    np.fill_diagonal(correlation, 1)
    variances[:, is_dc] = np.einsum(
        "sc,sd,cd,ck,dk->sk",
        np.sqrt(variance_leaf),
        np.sqrt(variance_leaf),
        correlation,
        assignment,
        assignment,
        optimize=True,
    )
    pack = np.broadcast_to(np.array([s.pack_size for s in spec.skus])[:, None], means.shape).copy()
    moq = np.broadcast_to(np.array([s.moq for s in spec.skus])[:, None], means.shape).copy()
    moq[:, is_dc] = np.maximum(
        moq[:, is_dc], np.array([suppliers[i].moq for i in primary])[:, None]
    )
    holding_unit = unit_cost[:, None] * np.where(holding > 0, holding, 1)
    q = np.sqrt(2 * means * 365 * order_cost / holding_unit)
    q = np.ceil(np.maximum(q, moq) / pack) * pack
    # shortcut: rounded gamma lead moments use +0.5 day; calibrate exact service in M7 sweeps.
    lead = np.where(lead_cv == 0, np.maximum(1, np.ceil(lead_mean)), lead_mean + 0.5)
    lead += delay_probability * delay_days
    lead_variance = (lead_mean * lead_cv) ** 2 + delay_probability * (
        1 - delay_probability
    ) * delay_days**2
    protection = lead[edge_for]
    z = np.full(count, ndtri(scenario.policy.target_csl))
    z[leaf] = [
        ndtri(c.target_csl) if c.kind == "b2b" else z[leaf[i]] for i, c in enumerate(customers)
    ]
    reorder = np.maximum(
        0,
        means * protection
        + z * np.sqrt(protection * variances + means**2 * lead_variance[edge_for]),
    )
    review = spec.inventory.review_days if scenario.policy.default == "RS" else 1
    if scenario.policy.default in ("RS", "order_up_to"):
        upper = np.maximum(
            reorder,
            means * (protection + review)
            + z * np.sqrt((protection + review) * variances + means**2 * lead_variance[edge_for]),
        )
    else:
        upper = reorder + q
    initial = upper * spec.inventory.initial_stock_fraction
    initial[:, is_supplier] = 0
    return BuiltNetwork(
        spec,
        scenario,
        nodes,
        source,
        target,
        lanes,
        canonical,
        len(spec.dcs) * (len(spec.suppliers) + nc),
        parent,
        edge_for,
        leaf,
        is_supplier,
        is_dc,
        q,
        reorder,
        upper,
        moq.astype(float),
        pack.astype(float),
        initial,
        capacity,
        unit_cost,
        holding,
        order_cost,
        fixed,
        handling,
        penalties,
        lead_mean,
        lead_cv,
        delay_probability,
        delay_days,
    )
