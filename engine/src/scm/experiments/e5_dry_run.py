"""E5 dry run: historical classification, service matching, and paired held-out runs."""

import argparse
import hashlib
import json
import platform
import subprocess
from importlib.metadata import version
from pathlib import Path
from typing import Annotated, TypedDict

import numpy as np
import yaml
from pydantic import Field

from scm.config.loader import load_study
from scm.config.models import PositiveInt
from scm.config.planning import PlanningSettings, ServiceTarget, load_planning
from scm.contracts import Contract
from scm.demand.generator import FloatArray
from scm.forecast.error_metrics import error_metrics
from scm.network.builder import BuiltNetwork, IntArray, build_network
from scm.network.inputs import network_inputs
from scm.policies.planning import ReplenishmentPlanner
from scm.sim.multi_echelon import simulate_network


class DryRunSettings(Contract):
    seed: Annotated[int, Field(ge=0)]
    training_days: Annotated[int, Field(ge=2)]
    calibration_replications: PositiveInt
    evaluation_replications: PositiveInt
    segmented_safety_offsets: list[float] = Field(min_length=1)
    service_tolerance: ServiceTarget


class Replication(TypedDict):
    seed: int
    fill_rate: float
    average_inventory_value_inr: float
    measured_cost_inr: float
    forecast_errors: dict[str, dict[str, float | None]]


def _replication(
    net: BuiltNetwork,
    history: FloatArray,
    settings: PlanningSettings,
    seed: int,
    inputs: tuple[FloatArray, IntArray],
) -> Replication:
    usage, leads = inputs
    result = simulate_network(
        net,
        usage,
        leads,
        warmup_days=net.scenario.warmup_days,
        planning=settings,
        demand_history=history,
    )
    assert result.forecast is not None and result.observed_demand is not None
    measured = slice(net.scenario.warmup_days, None)
    diagnostics: dict[str, dict[str, float | None]] = {}
    for name, columns in (
        ("customer_total", net.customer_indices),
        ("dc_order_total", np.flatnonzero(net.is_dc)),
    ):
        metrics = error_metrics(
            result.observed_demand[measured][:, :, columns].sum(axis=(1, 2)),
            result.forecast[measured][:, :, columns].sum(axis=(1, 2)),
        )
        diagnostics[name] = {
            key: float(value) if np.isfinite(value) else None for key, value in metrics.items()
        }
    return Replication(
        seed=seed,
        fill_rate=float(result.immediate[measured].sum() / usage[measured].sum()),
        average_inventory_value_inr=float(
            (result.average_inventory[measured] * net.unit_cost[None, :, None])
            .sum(axis=(1, 2))
            .mean()
        ),
        measured_cost_inr=float(result.measured_cost.sum()),
        forecast_errors=diagnostics,
    )


def run_dry_run(
    output: Path,
    *,
    config_path: Path = Path("configs/m4_validation.yaml"),
    scenario_path: Path = Path("configs/base_4dc.yaml"),
) -> dict[str, object]:
    config = DryRunSettings.model_validate(yaml.safe_load(config_path.read_text(encoding="utf-8")))
    study, settings = load_study(scenario_path), load_planning()
    net = build_network(study.spec, study.scenario)
    training_stream, calibration_stream, evaluation_stream = np.random.SeedSequence(
        config.seed
    ).spawn(3)
    training_seed = int(training_stream.generate_state(1)[0])
    calibration_seeds = [
        int(child.generate_state(1)[0])
        for child in calibration_stream.spawn(config.calibration_replications)
    ]
    evaluation_seeds = [
        int(child.generate_state(1)[0])
        for child in evaluation_stream.spawn(config.evaluation_replications)
    ]
    history, _ = network_inputs(net, study.seasonality, training_seed, config.training_days)
    days = study.scenario.warmup_days + study.scenario.horizon_days
    inputs = {
        seed: network_inputs(net, study.seasonality, seed, days)
        for seed in calibration_seeds + evaluation_seeds
    }
    uniform = settings.model_copy(deep=True)
    uniform.segmented = False
    uniform_calibration = [
        _replication(net, history, uniform, seed, inputs[seed]) for seed in calibration_seeds
    ]
    target = float(np.mean([r["fill_rate"] for r in uniform_calibration]))
    calibration: list[dict[str, object]] = []
    candidates: list[tuple[float, float]] = []
    for offset in config.segmented_safety_offsets:
        candidate = settings.model_copy(deep=True)
        candidate.segmented = True
        candidate.safety_factor_offset = offset
        rows = [
            _replication(net, history, candidate, seed, inputs[seed]) for seed in calibration_seeds
        ]
        fill = float(np.mean([r["fill_rate"] for r in rows]))
        gap = abs(fill - target)
        calibration.append(
            {
                "safety_factor_offset": offset,
                "mean_fill_rate": fill,
                "absolute_service_gap": gap,
                "replications": rows,
            }
        )
        candidates.append((gap, offset))
    calibration_gap, selected_offset = min(
        candidates, key=lambda pair: (pair[0], abs(pair[1]), pair[1])
    )
    segmented = settings.model_copy(deep=True)
    segmented.segmented = True
    segmented.safety_factor_offset = selected_offset
    uniform_evaluation = [
        _replication(net, history, uniform, seed, inputs[seed]) for seed in evaluation_seeds
    ]
    segmented_evaluation = [
        _replication(net, history, segmented, seed, inputs[seed]) for seed in evaluation_seeds
    ]
    fill_difference = float(
        np.mean(
            [
                b["fill_rate"] - a["fill_rate"]
                for a, b in zip(uniform_evaluation, segmented_evaluation)
            ]
        )
    )
    inventory_difference = float(
        np.mean(
            [
                b["average_inventory_value_inr"] - a["average_inventory_value_inr"]
                for a, b in zip(uniform_evaluation, segmented_evaluation)
            ]
        )
    )
    segments = ReplenishmentPlanner(net, settings, history).segments
    service_matched = abs(fill_difference) <= config.service_tolerance
    results: dict[str, object] = {
        "milestone": "M4",
        "experiment": "E5 dry run",
        "passed": calibration_gap <= config.service_tolerance and service_matched,
        "seeds": {
            "training": training_seed,
            "calibration": calibration_seeds,
            "evaluation": evaluation_seeds,
        },
        "segments": {
            "sku_ids": [s.id for s in study.spec.skus],
            "cell": segments.cell.tolist(),
            "annual_value_inr": segments.annual_value.tolist(),
            "cv": [float(v) if np.isfinite(v) else None for v in segments.cv],
        },
        "uniform_calibration": uniform_calibration,
        "segmented_calibration": calibration,
        "calibration_target_fill_rate": target,
        "selected_safety_offset": selected_offset,
        "evaluation": {
            "uniform": uniform_evaluation,
            "segmented": segmented_evaluation,
            "service_matched": service_matched,
            "fill_rate_difference": fill_difference,
            "average_inventory_value_difference_inr": inventory_difference,
        },
        "limitations": [
            "Synthetic data; few held-out replications test the pipeline, not inventory savings.",
            "Grid matching has a configured service tolerance, not exact service equality.",
            "Fixed historical SKU classes; no reclassification during measured days.",
            "DC forecasts use incoming orders; B2B target CSL floors remain active.",
            "Network warm-up and service approximations still need M7 calibration.",
        ],
    }
    output.mkdir(parents=True, exist_ok=True)
    result_path = output / "results.json"
    result_path.write_text(json.dumps(results, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    paths = sorted(
        set(Path("engine/src/scm").rglob("*.py"))
        | set(Path("configs").glob("*.yaml"))
        | {config_path, scenario_path}
    )
    try:
        git = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
        git_sha = git.stdout.strip() if git.returncode == 0 else None
    except FileNotFoundError:
        git_sha = None
    manifest = {
        "command": "python -m scm.experiments.e5_dry_run",
        "python": platform.python_version(),
        "git_sha": git_sha,
        "versions": {p: version(p) for p in ("numpy", "scipy", "pydantic", "PyYAML")},
        "input_sha256": {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
        "results_sha256": hashlib.sha256(result_path.read_bytes()).hexdigest(),
        "validation_settings": config.model_dump(),
        "planning_settings": settings.model_dump(),
        "scenario": study.scenario.model_dump(),
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/evidence/m4"))
    parser.add_argument("--config", type=Path, default=Path("configs/m4_validation.yaml"))
    parser.add_argument("--scenario", type=Path, default=Path("configs/base_4dc.yaml"))
    args = parser.parse_args()
    result = run_dry_run(args.output, config_path=args.config, scenario_path=args.scenario)
    print(
        json.dumps(
            {
                "passed": result["passed"],
                "selected_safety_offset": result["selected_safety_offset"],
                "output": str(args.output),
            },
            indent=2,
        )
    )
    if not result["passed"]:
        raise SystemExit("E5 dry-run service matching failed; see saved evidence")


if __name__ == "__main__":
    main()
