"""M6 controlled disruption validation; full E6 mitigation sweeps follow in M7."""

import argparse
import csv
import hashlib
import json
import platform
import subprocess
from importlib.metadata import version
from pathlib import Path
from typing import Annotated

import matplotlib
import numpy as np
import yaml
from pydantic import Field

from scm.config.loader import load_study
from scm.config.models import Positive, PositiveInt
from scm.contracts import Contract, Disruption
from scm.metrics.resilience import paired_resilience, rolling_fill
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.disruptions import affected_customers
from scm.sim.multi_echelon import simulate_network

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


class ValidationSettings(Contract):
    seed: Annotated[int, Field(ge=0)]
    replications: PositiveInt
    recovery_window: PositiveInt
    service_tolerance: Annotated[float, Field(ge=0, le=1)]
    analytic_stock: Positive
    analytic_daily_demand: Positive
    analytic_days: PositiveInt
    events: list[Disruption] = Field(min_length=1)


def load_validation(path: Path = Path("configs/m6_validation.yaml")) -> ValidationSettings:
    return ValidationSettings.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def analytic_check(config: ValidationSettings) -> dict[str, float | bool | None]:
    study = load_study()
    net = build_network(study.spec, study.scenario)
    leaf = int(net.customer_indices[0])
    dc = int(net.parent[0, leaf])
    net.initial_stock[:] = 0
    net.initial_stock[0, leaf] = config.analytic_stock
    usage = np.zeros((config.analytic_days, len(study.spec.skus), len(net.customer_indices)))
    usage[:, 0, 0] = config.analytic_daily_demand
    leads = np.ones((len(usage), len(net.source)), dtype=np.int64)
    baseline = simulate_network(net, usage, leads)
    event = Disruption(
        type="capacity_cut",
        target=net.node_ids[dc],
        start_day=0,
        duration=len(usage),
        magnitude=1.0,
    )
    net.scenario.disruptions = [event]
    result = simulate_network(net, usage, leads)
    metrics = paired_resilience(
        net,
        result,
        baseline,
        event,
        window=config.recovery_window,
        tolerance=config.service_tolerance,
    )
    expected = config.analytic_stock / config.analytic_daily_demand
    observed = metrics["tts_days"]
    return {
        "analytic_tts_days": expected,
        "observed_tts_days": observed,
        "passed": observed is not None and bool(np.isclose(observed, expected)),
    }


def run_validation(output: Path, config_path: Path) -> dict[str, object]:
    config = load_validation(config_path)
    study = load_study()
    net = build_network(study.spec, study.scenario)
    days = study.scenario.warmup_days + study.scenario.horizon_days
    output.mkdir(parents=True, exist_ok=True)
    analytic = analytic_check(config)
    rows: list[dict[str, object]] = []
    figure, axes = plt.subplots(
        len(config.events),
        1,
        figsize=(10, 2.6 * len(config.events)),
        squeeze=False,
        layout="constrained",
    )
    with (output / "daily_series.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "case",
                "seed",
                "day",
                "affected_demand",
                "affected_immediate",
                "baseline_demand",
                "baseline_immediate",
                "disruption_cost_inr",
            ]
        )
        streams = np.random.SeedSequence(config.seed).spawn(config.replications)
        for replication, stream in enumerate(streams):
            seed = int(stream.generate_state(1)[0])
            net.scenario.disruptions = []
            usage, leads = network_inputs(net, study.seasonality, seed, days)
            baseline = simulate_network(net, usage, leads, warmup_days=study.scenario.warmup_days)
            for index, event in enumerate(config.events):
                net.scenario.disruptions = [event]
                result = simulate_network(net, usage, leads, warmup_days=study.scenario.warmup_days)
                metrics = paired_resilience(
                    net,
                    result,
                    baseline,
                    event,
                    window=config.recovery_window,
                    tolerance=config.service_tolerance,
                )
                repeated = simulate_network(
                    net, usage, leads, warmup_days=study.scenario.warmup_days
                )
                repeat_metrics = paired_resilience(
                    net,
                    repeated,
                    baseline,
                    event,
                    window=config.recovery_window,
                    tolerance=config.service_tolerance,
                )
                repeatable = metrics == repeat_metrics and np.array_equal(
                    result.total_cost, repeated.total_cost
                )
                repeatable = repeatable and np.array_equal(result.immediate, repeated.immediate)
                del repeated
                rows.append(
                    {
                        "event": event.model_dump(),
                        "seed": seed,
                        "metrics": metrics,
                        "reproducible": repeatable,
                        "unrecovered_at_horizon": metrics["ttr_days"] is None,
                        "no_stockout_observed": metrics["tts_days"] is None,
                    }
                )
                scope = affected_customers(net, event.target)
                demand = result.demand[:, scope].sum(axis=1)
                served = result.immediate[:, :, net.customer_indices][:, scope].sum(axis=1)
                base_demand = baseline.demand[:, scope].sum(axis=1)
                base_served = baseline.immediate[:, :, net.customer_indices][:, scope].sum(axis=1)
                costs = (result.total_cost - baseline.total_cost).sum(axis=1)
                writer.writerows(
                    [
                        index,
                        seed,
                        day,
                        demand[day],
                        served[day],
                        base_demand[day],
                        base_served[day],
                        costs[day],
                    ]
                    for day in range(days)
                )
                if replication == 0:
                    axis = axes[index, 0]
                    axis.plot(
                        rolling_fill(base_demand, base_served, config.recovery_window),
                        color="#71717a",
                        label="Paired baseline",
                    )
                    axis.plot(
                        rolling_fill(demand, served, config.recovery_window),
                        color="#2B5C8A",
                        label="Disrupted",
                    )
                    axis.axvspan(
                        event.start_day,
                        event.start_day + event.duration,
                        color="#d4d4d8",
                        alpha=0.6,
                    )
                    axis.set(
                        title=f"{event.type.replace('_', ' ')} — {event.target}",
                        ylabel="Rolling unit fill",
                        ylim=(0, 1.03),
                        xlim=(study.scenario.warmup_days, days),
                    )
                    axis.legend(loc="lower right", fontsize=8)
                del result
    axes[-1, 0].set_xlabel("Simulation day (including warm-up)")
    figure.savefig(output / "disruptions.png", dpi=140)
    plt.close(figure)
    results: dict[str, object] = {
        "milestone": "M6",
        "passed": bool(analytic["passed"]) and all(row["reproducible"] for row in rows),
        "analytic": analytic,
        "network": rows,
        "limitations": [
            "Synthetic events and fixed sourcing; mitigation sweeps remain M7 work.",
            "Overlapping events are not assigned separate causal cost effects.",
            "TTR is first rolling recovery after an observed breach; later relapses are possible.",
            "No observed stockout/recovery is censored at the finite horizon.",
            "Backorder runs report zero lost sales; unmet demand remains backlog.",
        ],
    }
    result_path = output / "results.json"
    result_path.write_text(json.dumps(results, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    paths = sorted(
        set(Path("engine/src/scm").rglob("*.py"))
        | set(Path("configs").glob("*.yaml"))
        | {config_path}
        | set(Path("contracts").glob("*.schema.json"))
    )
    try:
        git = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
        git_sha = git.stdout.strip() if git.returncode == 0 else None
    except FileNotFoundError:
        git_sha = None
    manifest = {
        "command": "python -m scm.experiments.e6_validate",
        "python": platform.python_version(),
        "git_sha": git_sha,
        "versions": {p: version(p) for p in ("numpy", "scipy", "pydantic", "PyYAML", "matplotlib")},
        "input_sha256": {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
        "output_sha256": {
            name: hashlib.sha256((output / name).read_bytes()).hexdigest()
            for name in ("results.json", "daily_series.csv", "disruptions.png")
        },
        "validation_settings": config.model_dump(),
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/evidence/m6"))
    parser.add_argument("--config", type=Path, default=Path("configs/m6_validation.yaml"))
    args = parser.parse_args()
    results = run_validation(args.output, args.config)
    print(json.dumps({"passed": results["passed"], "output": str(args.output)}, indent=2))
    if not results["passed"]:
        raise SystemExit("M6 resilience validation failed; see saved evidence")


if __name__ == "__main__":
    main()
