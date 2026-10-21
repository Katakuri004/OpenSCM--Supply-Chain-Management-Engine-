"""M5: Chen benchmark and paired bullwhip cause/countermeasure checks."""

import argparse
import csv
import hashlib
import json
import platform
import subprocess
from functools import partial
from importlib.metadata import version
from pathlib import Path
from typing import Annotated, TypedDict

import matplotlib
import numpy as np
import yaml
from pydantic import Field

from scm.config.bullwhip import BullwhipSettings, load_bullwhip
from scm.config.loader import load_study
from scm.config.models import PositiveInt
from scm.config.planning import load_planning
from scm.contracts import BullwhipConfig, Contract
from scm.metrics.bullwhip import bullwhip_ratio, chen_bound, echelon_series
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.bullwhip_reference import order_process
from scm.sim.multi_echelon import simulate_network

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


class TheorySettings(Contract):
    daily_mean: Annotated[float, Field(gt=0)]
    daily_std: Annotated[float, Field(gt=0)]
    lead_periods: PositiveInt
    windows: list[PositiveInt] = Field(min_length=1)
    safety_factor: Annotated[float, Field(ge=0)]
    warmup_days: PositiveInt
    horizon_days: Annotated[int, Field(ge=2)]
    replications: PositiveInt
    relative_tolerance: Annotated[float, Field(gt=0, lt=1)]
    control_tolerance: Annotated[float, Field(gt=0, lt=1)]


class NetworkSettings(Contract):
    training_days: Annotated[int, Field(ge=2)]
    replications: PositiveInt
    forecast_window: PositiveInt
    smoothing_alpha: Annotated[float, Field(gt=0, le=1)]
    lead_time_factor: Annotated[float, Field(gt=0, le=1)]


class ValidationSettings(Contract):
    seed: Annotated[int, Field(ge=0)]
    theory: TheorySettings
    network: NetworkSettings


class TheoryResult(TypedDict):
    window: int
    bound: float
    observed_ratio: float
    control_ratio: float
    relative_gap: float
    passed: bool


class NetworkResultRow(TypedDict):
    case: str
    seed: int
    ratios: dict[str, float]


class Comparison(TypedDict):
    case: str
    baseline: str
    expected: str
    paired_dc_differences: list[float]
    passed: bool


def load_validation(path: Path = Path("configs/m5_validation.yaml")) -> ValidationSettings:
    return ValidationSettings.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def validate_theory(config: ValidationSettings) -> list[TheoryResult]:
    cfg = config.theory
    stream = np.random.SeedSequence(config.seed).spawn(2)[0]
    usage = np.random.default_rng(stream).normal(
        cfg.daily_mean, cfg.daily_std, (cfg.warmup_days + cfg.horizon_days, cfg.replications)
    )
    rows: list[TheoryResult] = []
    for window in cfg.windows:
        process = partial(
            order_process,
            usage,
            lead_periods=cfg.lead_periods,
            window=window,
            initial_mean=cfg.daily_mean,
            initial_std=cfg.daily_std,
            safety_factor=cfg.safety_factor,
        )
        orders = process()
        control = process(known_demand=True)
        observed = float(
            bullwhip_ratio(orders, usage, warmup_days=cfg.warmup_days, period_days=1).mean()
        )
        known = float(
            bullwhip_ratio(control, usage, warmup_days=cfg.warmup_days, period_days=1).mean()
        )
        bound = chen_bound(cfg.lead_periods, window)
        gap = (observed - bound) / bound
        rows.append(
            TheoryResult(
                window=window,
                bound=bound,
                observed_ratio=observed,
                control_ratio=known,
                relative_gap=gap,
                passed=0 <= gap <= cfg.relative_tolerance
                and abs(known - 1) <= cfg.control_tolerance,
            )
        )
    return rows


def _cases(config: ValidationSettings) -> dict[str, tuple[BullwhipConfig, BullwhipSettings]]:
    def flags(**enabled: bool) -> BullwhipConfig:
        values = dict(
            signal_processing=False, batching=False, price=False, rationing=False, pos_sharing=False
        )
        values.update(enabled)
        return BullwhipConfig(**values)

    base = load_bullwhip()
    cases = {"control": (flags(), base)}
    for cause in ("signal_processing", "batching", "price", "rationing"):
        cases[cause] = (flags(**{cause: True}), base)
    cases["pos_sharing"] = (flags(signal_processing=True, pos_sharing=True), base)
    cases["smoothing"] = (
        flags(signal_processing=True),
        base.model_copy(update={"smoothing_alpha": config.network.smoothing_alpha}),
    )
    cases["lead_reduction"] = (
        flags(signal_processing=True),
        base.model_copy(update={"lead_time_factor": config.network.lead_time_factor}),
    )
    coordinated = flags(signal_processing=True, batching=True, rationing=True)
    cases["coordination_baseline"] = (coordinated, base)
    cases["vmi"] = (coordinated, base.model_copy(update={"vmi": True}))
    cases["edlp"] = (flags(price=True), base.model_copy(update={"edlp": True}))
    return cases


def validate_network(
    config: ValidationSettings, output: Path
) -> tuple[list[NetworkResultRow], list[Comparison]]:
    study, planning = load_study(), load_planning()
    planning.segmented = False
    planning.forecast.method = "moving_average"
    planning.forecast.window = config.network.forecast_window
    net = build_network(study.spec, study.scenario)
    stream = np.random.SeedSequence(config.seed).spawn(2)[1]
    children = stream.spawn(config.network.replications + 1)
    training_seed = int(children[0].generate_state(1)[0])
    history, _ = network_inputs(net, study.seasonality, training_seed, config.network.training_days)
    days = study.scenario.warmup_days + study.scenario.horizon_days
    rows: list[NetworkResultRow] = []
    output.mkdir(parents=True, exist_ok=True)
    with (output / "daily_series.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        names = ["customer_demand", "customer_orders", "dc_orders", "supplier_orders_received"]
        writer.writerow(["case", "seed", "day", *names])
        for child in children[1:]:
            seed = int(child.generate_state(1)[0])
            usage, leads = network_inputs(net, study.seasonality, seed, days)
            for case, (flags, settings) in _cases(config).items():
                net.scenario.bullwhip = flags
                result = simulate_network(
                    net,
                    usage,
                    leads,
                    warmup_days=study.scenario.warmup_days,
                    planning=planning,
                    demand_history=history,
                    bullwhip=settings,
                )
                series = echelon_series(net, result)
                ratios = {
                    name: float(
                        bullwhip_ratio(
                            values, series["customer_demand"], warmup_days=result.warmup_days
                        )
                    )
                    for name, values in series.items()
                }
                rows.append(NetworkResultRow(case=case, seed=seed, ratios=ratios))
                writer.writerows(
                    [case, seed, day, *(series[name][day] for name in names)] for day in range(days)
                )
                del result
    comparisons: list[Comparison] = []
    for case, baseline, expected in (
        ("signal_processing", "control", "increase"),
        ("batching", "control", "increase"),
        ("price", "control", "increase"),
        ("rationing", "control", "increase"),
        ("pos_sharing", "signal_processing", "decrease"),
        ("smoothing", "signal_processing", "decrease"),
        ("lead_reduction", "signal_processing", "decrease"),
        ("vmi", "coordination_baseline", "decrease"),
        ("edlp", "price", "decrease"),
    ):
        treated = [row["ratios"]["dc_orders"] for row in rows if row["case"] == case]
        reference = [row["ratios"]["dc_orders"] for row in rows if row["case"] == baseline]
        differences = np.subtract(treated, reference)
        passed = np.all(differences > 0 if expected == "increase" else differences < 0)
        comparisons.append(
            Comparison(
                case=case,
                baseline=baseline,
                expected=expected,
                paired_dc_differences=differences.tolist(),
                passed=bool(passed),
            )
        )
    return rows, comparisons


def _plot(output: Path, theory: list[TheoryResult], network: list[NetworkResultRow]) -> None:
    figure, axes = plt.subplots(1, 2, figsize=(13, 4.8), layout="constrained")
    windows = [row["window"] for row in theory]
    axes[0].plot(
        windows, [row["bound"] for row in theory], "o--", color="#71717a", label="Chen bound"
    )
    axes[0].plot(
        windows,
        [row["observed_ratio"] for row in theory],
        "o-",
        color="#2B5C8A",
        label="Simulation (estimated safety stock)",
    )
    axes[0].axhline(1, color="#a1a1aa", label="Known-demand control ≈ 1")
    axes[0].set(
        xlabel="Moving-average window (days)",
        ylabel="Daily order / demand variance",
        title="Single-stage reference: IID demand, constant lead",
    )
    axes[0].legend(fontsize=8)
    cases = list(dict.fromkeys(row["case"] for row in network))
    means = [np.mean([r["ratios"]["dc_orders"] for r in network if r["case"] == c]) for c in cases]
    axes[1].barh([c.replace("_", " ") for c in cases], means, color="#2B5C8A")
    axes[1].set(
        xscale="log",
        xlabel="Weekly DC order / customer demand variance (log scale)",
        title="Controlled network comparisons: mean of paired runs",
    )
    axes[1].invert_yaxis()
    figure.savefig(output / "bullwhip.png", dpi=160)
    plt.close(figure)


def run_validation(output: Path, config_path: Path) -> dict[str, object]:
    config = load_validation(config_path)
    theory = validate_theory(config)
    network, comparisons = validate_network(config, output)
    results: dict[str, object] = {
        "milestone": "M5",
        "passed": all(r["passed"] for r in [*theory, *comparisons]),
        "theory": theory,
        "network": network,
        "comparisons": comparisons,
        "limitations": [
            "Synthetic controlled comparisons, not calibrated operating forecasts.",
            "Daily Chen benchmark and weekly network ratios have different time aggregation.",
            "Suppliers receive DC orders; no further upstream purchasing stage is modeled.",
            "The full E4 factorial experiment and confidence intervals belong to M7.",
        ],
    }
    (output / "results.json").write_text(
        json.dumps(results, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    _plot(output, theory, network)
    paths = sorted(
        set(Path("engine/src/scm").rglob("*.py"))
        | set(Path("configs").glob("*.yaml"))
        | {config_path}
    )
    try:
        git = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
        git_sha = git.stdout.strip() if git.returncode == 0 else None
    except FileNotFoundError:
        git_sha = None
    manifest = {
        "command": "python -m scm.experiments.e4_validate",
        "python": platform.python_version(),
        "git_sha": git_sha,
        "versions": {p: version(p) for p in ("numpy", "scipy", "pydantic", "PyYAML", "matplotlib")},
        "input_sha256": {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
        "output_sha256": {
            name: hashlib.sha256((output / name).read_bytes()).hexdigest()
            for name in ("results.json", "daily_series.csv", "bullwhip.png")
        },
        "validation_settings": config.model_dump(),
        "cases": {
            name: {"flags": flags.model_dump(), "settings": settings.model_dump()}
            for name, (flags, settings) in _cases(config).items()
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/evidence/m5"))
    parser.add_argument("--config", type=Path, default=Path("configs/m5_validation.yaml"))
    args = parser.parse_args()
    result = run_validation(args.output, args.config)
    print(json.dumps({"passed": result["passed"], "output": str(args.output)}, indent=2))
    if not result["passed"]:
        raise SystemExit("M5 bullwhip validation failed; see saved evidence")


if __name__ == "__main__":
    main()
