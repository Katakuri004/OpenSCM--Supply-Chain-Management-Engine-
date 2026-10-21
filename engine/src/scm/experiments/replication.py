"""One replication returns small metric records, never simulation histories."""

from pathlib import Path

import numpy as np

from scm.analytics.eoq import eoq
from scm.analytics.safety_stock import lead_time_std, z_for_csl
from scm.config.bullwhip import load_bullwhip
from scm.config.loader import load_study
from scm.config.planning import load_planning
from scm.contracts import BullwhipConfig, ExperimentRow
from scm.demand.generator import demand, draw_streams, lead_days
from scm.experiments.design import Case, ExperimentSpec
from scm.experiments.e6_validate import load_validation
from scm.metrics.bullwhip import bullwhip_ratio, echelon_series
from scm.metrics.resilience import paired_resilience
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.engine import SingleNodeConfig, simulate
from scm.sim.multi_echelon import simulate_network


def replication(
    spec: ExperimentSpec, experiment: str, case: Case, phase: str, index: int, seed: int
) -> list[ExperimentRow]:
    study = load_study()
    study.scenario.warmup_days, study.scenario.horizon_days = spec.warmup_days, spec.horizon_days
    f = case.factors
    days = spec.warmup_days + spec.horizon_days
    metrics: dict[str, float | None] = {}
    if experiment == "E2":
        sku = next((s for s in study.spec.skus if s.id == f["sku"]), None)
        if sku is None:
            raise ValueError("E2 references an unknown SKU")
        supplier = next(s for s in study.spec.suppliers if s.id == sku.supplier)
        streams = draw_streams(seed, days, 1, 1)
        usage = demand(
            streams, [[sku.daily_mean]], [[sku.daily_mean * sku.cv]], kind=sku.demand_kind
        )[:, :, 0]
        leads = lead_days(streams.lead_uniform[:, :, 0], supplier.lead_mean, supplier.lead_cv)
        unit_cost = sku.unit_cost * supplier.price_multiplier
        holding = unit_cost * study.spec.inventory.customer_holding_rate
        q = eoq(sku.daily_mean * 365, study.spec.inventory.customer_order_cost, holding)
        sigma = lead_time_std(
            sku.daily_mean,
            sku.daily_mean * sku.cv,
            supplier.lead_mean,
            supplier.lead_mean * supplier.lead_cv,
        )
        reorder = sku.daily_mean * supplier.lead_mean + z_for_csl(float(f["target_csl"])) * sigma
        result = simulate(
            usage,
            leads,
            SingleNodeConfig(
                quantity=q,
                reorder_point=reorder,
                initial_on_hand=q + reorder,
                warmup_days=spec.warmup_days,
                order_cost=study.spec.inventory.customer_order_cost,
                unit_cost=unit_cost,
                annual_holding_cost=holding,
                shortage_cost=0,
            ),
        )
        metrics = {
            "fill_rate": float(result.fill_rate[0]),
            "achieved_csl": float(result.cycle_service_level[0]),
            "inventory_cost_inr": float(
                (result.costs["holding"] + result.costs["ordering"])[spec.warmup_days :].sum()
            ),
            "inventory_value_inr": float(
                result.average_inventory[spec.warmup_days :].mean() * unit_cost
            ),
        }
    else:
        planning, bullwhip, mitigation = None, None, None
        inbound, outbound = None, 1.0
        if experiment == "E3":
            study.scenario.network.dc_count = int(f["dc_count"])  # type: ignore[assignment]
            study.scenario.demand.regional_rho = float(f["rho"])
            for sku in study.spec.skus:
                sku.cv = float(f["demand_cv"])
            inbound, outbound = float(f["inbound_days"]), float(f["outbound_factor"])
        if experiment in {"E4", "E5"}:
            planning = load_planning()
            planning.segmented = bool(f.get("segmented", False))
            planning.safety_factor_offset = float(f.get("offset", 0))
        if experiment == "E4":
            study.scenario.bullwhip = BullwhipConfig.model_validate(
                {key: f[key] for key in BullwhipConfig.model_fields}
            )
            bullwhip = load_bullwhip()
            bullwhip.lead_time_factor = float(f["lead_factor"])
        if experiment == "E6":
            mitigation = spec.e6.mitigations[str(f["mitigation"])]
            scale = float(f["scale"])
            if f["parameter"] == "demand":
                for sku in study.spec.skus:
                    sku.daily_mean *= scale
            if f["parameter"] == "capacity":
                for supplier in study.spec.suppliers:
                    supplier.daily_capacity *= scale
                for dc in study.spec.dcs:
                    dc.daily_capacity *= scale
            if f["parameter"] == "lead":
                for supplier in study.spec.suppliers:
                    supplier.lead_mean *= scale
            if f["parameter"] == "holding":
                for dc in study.spec.dcs:
                    dc.holding_rate *= scale
                study.spec.inventory.customer_holding_rate *= scale
        net = build_network(study.spec, study.scenario, inbound_lead_days=inbound)
        usage, leads = network_inputs(net, study.seasonality, seed, days)
        history = None
        if planning is not None:
            training_seed = int(
                np.random.SeedSequence([spec.seed, int(experiment[1]), 0]).generate_state(1)[0]
            )
            history, _ = network_inputs(net, study.seasonality, training_seed, spec.training_days)
        if experiment == "E6":
            cfg = load_validation(Path(spec.e6.events_config))
            event = cfg.events[int(f["event"])]
            baseline = simulate_network(
                net, usage, leads, warmup_days=spec.warmup_days, mitigation=mitigation
            )
            net.scenario.disruptions = [event]
        run = simulate_network(
            net,
            usage,
            leads,
            warmup_days=spec.warmup_days,
            planning=planning,
            demand_history=history,
            bullwhip=bullwhip,
            mitigation=mitigation,
            outbound_freight_factor=outbound,
        )
        measured = slice(spec.warmup_days, None)
        metrics = {
            "fill_rate": float(run.immediate[measured].sum() / run.demand[measured].sum()),
            "landed_cost_inr": float(run.measured_cost.sum()),
            "inventory_value_inr": float(
                (run.average_inventory[measured] * net.unit_cost[None, :, None])
                .sum(axis=(1, 2))
                .mean()
            ),
        }
        metrics.update(
            {
                f"cost_{name}_inr": float(values[measured].sum())
                for name, values in run.costs.items()
            }
        )
        if experiment == "E4":
            series = echelon_series(net, run)
            metrics.update(
                {
                    f"bwe_{name}": float(
                        bullwhip_ratio(
                            values, series["customer_demand"], warmup_days=spec.warmup_days
                        )
                    )
                    for name, values in series.items()
                }
            )
        if experiment == "E6":
            metrics.update(
                paired_resilience(
                    net,
                    run,
                    baseline,
                    event,
                    window=cfg.recovery_window,
                    tolerance=cfg.service_tolerance,
                )
            )
    return [
        ExperimentRow.model_validate(
            dict(
                experiment=experiment,
                case_id=case.case_id,
                phase=phase,
                replication=index,
                seed=seed,
                metric=metric,
                value=value if value is not None and np.isfinite(value) else None,
            )
        )
        for metric, value in metrics.items()
    ]
