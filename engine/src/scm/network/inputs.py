"""Demand and transit draws with stable customer and potential-lane identities."""

from dataclasses import astuple

import numpy as np

from scm.config.models import Seasonality
from scm.demand.generator import (
    FloatArray,
    Streams,
    demand,
    draw_streams,
    lead_days,
    monthly_seasonality,
)
from scm.network.builder import BuiltNetwork, IntArray


def network_inputs(
    net: BuiltNetwork, seasonality: Seasonality, seed: int, days: int
) -> tuple[FloatArray, IntArray]:
    spec = net.spec
    streams = draw_streams(seed, days, len(spec.skus), len(spec.customers))
    base = np.array([s.daily_mean for s in spec.skus])[:, None] * np.array(
        [c.demand_scale for c in spec.customers]
    )
    sigma = base * np.array([s.cv for s in spec.skus])[:, None] * net.scenario.demand.cv_scale
    regions = np.array([c.region for c in spec.customers])
    season = monthly_seasonality(days, seasonality.monthly_index_v1)
    usage = demand(
        streams,
        base,
        sigma,
        regional_rho=net.scenario.demand.regional_rho,
        regions=regions,
        season=season,
    )
    gamma_skus = np.array([s.demand_kind == "gamma" for s in spec.skus])
    if gamma_skus.any():
        gamma_streams = Streams(*(a[:, gamma_skus] for a in astuple(streams)))
        usage[:, gamma_skus] = demand(
            gamma_streams,
            base[gamma_skus],
            sigma[gamma_skus],
            regional_rho=net.scenario.demand.regional_rho,
            regions=regions,
            season=season,
            kind="gamma",
        )
    b2b = np.array([c.kind == "b2b" for c in spec.customers])
    sizes = demand(streams, base, sigma, season=season, kind="b2b")
    arrivals = streams.b2b_uniform < np.array([c.arrival_probability for c in spec.customers])
    usage[:, :, b2b] = (sizes * arrivals)[:, :, b2b]
    children = np.random.SeedSequence(seed).spawn(4)
    uniform = np.random.default_rng(children[1]).random((days, net.canonical_edge_count))
    delay = np.random.default_rng(children[2]).random((days, net.canonical_edge_count))
    # Setup only: the simulation itself has no per-SKU or per-node loop.
    leads = np.column_stack(
        [
            lead_days(uniform[:, key], float(mean), float(cv))
            for key, mean, cv in zip(net.canonical_edge, net.lead_mean, net.lead_cv)
        ]
    )
    leads += (delay[:, net.canonical_edge] < net.delay_probability) * net.delay_days
    return usage, leads
