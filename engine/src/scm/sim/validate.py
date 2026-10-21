"""Reproduce M2 acceptance cases: python -m scm.sim.validate."""

import argparse
import hashlib
import json
import platform
from importlib.metadata import version
from pathlib import Path
from typing import Annotated, Any

import numpy as np
import yaml
from pydantic import Field

from scm.analytics.eoq import annual_cost, eoq
from scm.analytics.safety_stock import fill_rate, lead_time_std, z_for_csl, z_for_fill_rate
from scm.contracts import Contract, Nonnegative
from scm.demand.generator import FloatArray, demand, draw_streams, lead_days
from scm.sim.engine import SimulationResult, SingleNodeConfig, simulate

Positive = Annotated[float, Field(gt=0)]
PositiveInt = Annotated[int, Field(gt=0)]
Probability = Annotated[float, Field(gt=0, lt=1)]


class ServiceCase(Contract):
    horizon_days: PositiveInt
    daily_std: Positive
    lead_mean: Positive
    lead_cv: Positive
    quantity: Positive
    target_csl: Probability
    fill_quantity: Positive
    target_fill_rate: Probability


class Benchmark(Contract):
    seed: Annotated[int, Field(ge=0)]
    replications: Annotated[int, Field(ge=2)]
    warmup_days: PositiveInt
    horizon_days: PositiveInt
    daily_mean: Positive
    daily_std: Positive
    order_cost: Positive
    unit_cost: Nonnegative
    annual_holding_cost: Positive
    shortage_cost: Nonnegative
    lead_mean: Positive
    q_multipliers: list[Positive] = Field(min_length=3)
    service: ServiceCase
    crn_quantity_multiplier: Positive
    welch_window: PositiveInt
    base_warmup_days: PositiveInt


def samples(
    seed: int, days: int, replications: int, mean: float, std: float, lead: float, cv: float
) -> tuple[FloatArray, np.ndarray[tuple[int, ...], np.dtype[np.int64]]]:
    # Replication seeds and canonical axes stay fixed when policy or replication count changes.
    streams = [
        draw_streams(int(child.generate_state(1)[0]), days, 1, 1)
        for child in np.random.SeedSequence(seed).spawn(replications)
    ]
    usage = np.concatenate([demand(s, [[mean]], [[std]])[:, :, 0] for s in streams], axis=1)
    leads = np.concatenate([lead_days(s.lead_uniform[:, :, 0], lead, cv) for s in streams], axis=1)
    return usage, leads


def policy(c: Benchmark, quantity: float, reorder: float) -> SingleNodeConfig:
    return SingleNodeConfig(
        quantity=quantity,
        reorder_point=reorder,
        initial_on_hand=quantity + reorder,
        warmup_days=c.warmup_days,
        order_cost=c.order_cost,
        unit_cost=c.unit_cost,
        annual_holding_cost=c.annual_holding_cost,
        shortage_cost=c.shortage_cost,
    )


def annualized(result: SimulationResult) -> FloatArray:
    return result.measured_cost * 365 / (len(result.demand) - result.warmup_days)


def run_validation(config_path: Path, output: Path, *, plots: bool = True) -> dict[str, Any]:
    c = Benchmark.model_validate(yaml.safe_load(config_path.read_text(encoding="utf-8")))
    if c.welch_window > min(2 * c.warmup_days, c.service.horizon_days + c.warmup_days):
        raise ValueError("Welch window must fit the saved warm-up trace")
    checks: dict[str, dict[str, float | bool]] = {}

    def compare(name: str, actual: float, expected: float, tolerance: float) -> None:
        checks[name] = {
            "actual": actual,
            "expected": expected,
            "tolerance": tolerance,
            "passed": abs(actual - expected) <= tolerance,
        }

    q = eoq(365 * c.daily_mean, c.order_cost, c.annual_holding_cost)
    total_days = c.horizon_days + c.warmup_days
    deterministic, fixed_leads = samples(c.seed, total_days, 1, c.daily_mean, 0, c.lead_mean, 0)
    baseline = simulate(deterministic, fixed_leads, policy(c, q, c.daily_mean * c.lead_mean))
    expected_cost = annual_cost(q, 365 * c.daily_mean, c.order_cost, c.annual_holding_cost)
    expected_cost += 365 * c.daily_mean * c.unit_cost
    compare("V1_cost", float(annualized(baseline)[0]), expected_cost, 0.005 * expected_cost)
    compare("V1_stockout_days", float(np.count_nonzero(baseline.backorders[c.warmup_days :])), 0, 0)

    usage, leads = samples(
        c.seed, total_days, c.replications, c.daily_mean, c.daily_std, c.lead_mean, 0
    )
    sweep = []
    quantities = q * np.asarray(c.q_multipliers)
    for quantity in quantities:
        run = simulate(usage, leads, policy(c, float(quantity), c.daily_mean * c.lead_mean))
        relevant = run.costs["holding"] + run.costs["ordering"]
        sweep.append(relevant[c.warmup_days :].mean(axis=0) * 365)
    sweep_cost = np.asarray(sweep)
    best_q = float(quantities[np.argmin(sweep_cost.mean(axis=1))])
    compare("V2_optimal_quantity", best_q, q, 0.1 * q)

    service_details = {}
    s = c.service
    service_days = s.horizon_days + c.warmup_days
    for label, cv in (("fixed", 0.0), ("variable", s.lead_cv)):
        service_demand, service_leads = samples(
            c.seed, service_days, c.replications, c.daily_mean, s.daily_std, s.lead_mean, cv
        )
        sigma = lead_time_std(c.daily_mean, s.daily_std, s.lead_mean, s.lead_mean * cv)
        z = z_for_csl(s.target_csl)
        run = simulate(
            service_demand,
            service_leads,
            policy(c, s.quantity, c.daily_mean * s.lead_mean + z * sigma),
        )
        if run.completed_cycles.sum() == 0:
            raise ValueError("V3 requires completed replenishment cycles after warm-up")
        csl = float(run.successful_cycles.sum() / run.completed_cycles.sum())
        compare(f"V3_{label}_csl", csl, s.target_csl, 0.015)
        service_details[label] = {
            "cycles": int(run.completed_cycles.sum()),
            "sigma_l": sigma,
            "rounded_lead_mean": float(service_leads.mean()),
            "rounded_lead_std": float(service_leads.std()),
        }
    sigma = lead_time_std(c.daily_mean, s.daily_std, s.lead_mean)
    z = z_for_fill_rate(s.target_fill_rate, sigma, s.fill_quantity)
    service_demand, service_leads = samples(
        c.seed, service_days, c.replications, c.daily_mean, s.daily_std, s.lead_mean, 0
    )
    service_run = simulate(
        service_demand,
        service_leads,
        policy(c, s.fill_quantity, c.daily_mean * s.lead_mean + z * sigma),
    )
    compare(
        "V4_fill_rate",
        float(service_run.fill_rate.mean()),
        fill_rate(z, sigma, s.fill_quantity),
        0.01,
    )

    # Independent FIFO unit matching, not dwell inferred from average inventory.
    arrival_units = baseline.received[:, 0].copy()
    arrival_units[0] += baseline.demand[0, 0] * c.lead_mean + q
    shipped = baseline.fulfilled[:, 0]
    if not (
        np.allclose(arrival_units, np.rint(arrival_units))
        and np.allclose(shipped, np.rint(shipped))
    ):
        raise ValueError("V6 unit matching requires integer deterministic quantities")
    arrival_times = np.repeat(np.arange(total_days), np.rint(arrival_units).astype(int))
    departure_times = np.repeat(np.arange(total_days) + 0.5, np.rint(shipped).astype(int))
    dwell = departure_times - arrival_times[: len(departure_times)]
    measured = departure_times >= c.warmup_days
    mean_dwell = float(dwell[measured].mean())
    throughput = float(shipped[c.warmup_days :].mean())
    inventory = float(baseline.average_inventory[c.warmup_days :].mean())
    compare("V6_littles_law", inventory, throughput * mean_dwell, 0.02 * inventory)

    a = simulate(usage, leads, policy(c, q, c.daily_mean * c.lead_mean))
    repeat = simulate(usage, leads, policy(c, q, c.daily_mean * c.lead_mean))
    compare("V8_reproducibility", float(np.max(np.abs(a.total_cost - repeat.total_cost))), 0, 0)
    b_policy = policy(c, q * c.crn_quantity_multiplier, c.daily_mean * c.lead_mean)
    b = simulate(usage, leads, b_policy)
    independent, independent_leads = samples(
        c.seed + 1, total_days, c.replications, c.daily_mean, c.daily_std, c.lead_mean, 0
    )
    unpaired = simulate(independent, independent_leads, b_policy)
    paired_variance = float(np.var(annualized(b) - annualized(a), ddof=1))
    unpaired_variance = float(np.var(annualized(unpaired) - annualized(a), ddof=1))
    if unpaired_variance == 0:
        raise ValueError("V8 variance reduction is undefined for a zero-variance comparison")
    checks["V8_variance"] = {
        "paired": paired_variance,
        "unpaired": unpaired_variance,
        "reduction_fraction": 1 - paired_variance / unpaired_variance,
        "passed": paired_variance < unpaired_variance,
    }
    output.mkdir(parents=True, exist_ok=True)
    result = {
        "checks": checks,
        "config": c.model_dump(),
        "service": service_details,
        "little": {"mean_dwell_days": mean_dwell, "throughput_units_per_day": throughput},
    }
    (output / "results.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    np.savetxt(
        output / "q_sweep.csv",
        np.column_stack((quantities, sweep_cost)),
        delimiter=",",
        header="quantity," + ",".join(f"replication_{i}" for i in range(c.replications)),
        comments="",
    )
    welch = service_run.average_inventory[: 2 * c.warmup_days].mean(axis=1)
    np.savetxt(
        output / "welch.csv",
        np.column_stack((np.arange(len(welch)), welch)),
        delimiter=",",
        header="day,mean_inventory_units",
        comments="",
    )
    if plots:
        plot_validation(output, c, q, quantities, sweep_cost, welch)
    root = Path(__file__).resolve().parents[4]
    sources = [
        config_path,
        root / "requirements-dev.lock",
        *sorted((root / "engine/src").rglob("*.py")),
    ]
    manifest = {
        "python": platform.python_version(),
        "packages": {name: version(name) for name in ("numpy", "scipy", "pydantic", "matplotlib")},
        "source_sha256": {
            str(p.relative_to(root) if p.is_relative_to(root) else p): hashlib.sha256(
                p.read_bytes()
            ).hexdigest()
            for p in sources
        },
        "output_sha256": {
            name: hashlib.sha256((output / name).read_bytes()).hexdigest()
            for name in ["results.json", "q_sweep.csv", "welch.csv"]
            + (["validation.png"] if plots else [])
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return result


def plot_validation(
    output: Path,
    c: Benchmark,
    q: float,
    quantities: FloatArray,
    costs: FloatArray,
    welch: FloatArray,
) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from scipy.stats import t

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.5), layout="constrained")
    error = costs.std(axis=1, ddof=1) / np.sqrt(c.replications) * t.ppf(0.975, c.replications - 1)
    axes[0].errorbar(
        quantities,
        costs.mean(axis=1),
        yerr=error,
        color="#2B5C8A",
        marker="o",
        capsize=3,
        label="Simulation mean ± 95% t interval",
    )
    axes[0].axvline(q, color="#27272A", linestyle="--", label=f"Analytical EOQ = {q:g}")
    axes[0].set(
        title="V2 · Quantity cost sweep",
        xlabel="Order quantity (units)",
        ylabel="Ordering + holding cost (INR/year)",
    )
    axes[0].legend(fontsize=8)
    smooth = np.convolve(welch, np.ones(c.welch_window) / c.welch_window, mode="valid")
    axes[1].plot(
        np.arange(len(smooth)) + (c.welch_window - 1) / 2,
        smooth,
        color="#2B5C8A",
        label=f"{c.welch_window}-day centered moving average",
    )
    axes[1].axvline(c.warmup_days, color="#27272A", linestyle="--", label="Benchmark warm-up")
    axes[1].axvline(c.base_warmup_days, color="#71717A", linestyle=":", label="Base preset warm-up")
    axes[1].set(
        title="Welch plot · Fill-rate benchmark",
        xlabel="Day from simulation start",
        ylabel="Mean on-hand inventory (units)",
    )
    axes[1].legend(fontsize=8)
    for axis in axes:
        axis.grid(axis="y", color="#E4E4E7")
        axis.spines[["top", "right"]].set_visible(False)
    fig.suptitle(f"M2 synthetic validation · {c.replications} replications · seed {c.seed}")
    fig.savefig(output / "validation.png", dpi=160)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("configs/m2_validation.yaml"))
    parser.add_argument("--output", type=Path, default=Path("data/m2_validation"))
    args = parser.parse_args()
    result = run_validation(args.config, args.output)
    print(json.dumps(result["checks"], indent=2))
    if not all(check["passed"] for check in result["checks"].values()):
        raise SystemExit("M2 acceptance failed; see saved results")


if __name__ == "__main__":
    main()
