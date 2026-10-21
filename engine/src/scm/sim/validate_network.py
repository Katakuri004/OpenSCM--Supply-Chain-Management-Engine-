"""Reproducible M3 pooling validation and measured network performance."""

import argparse
import hashlib
import json
import os
import platform
import subprocess
from concurrent.futures import ProcessPoolExecutor
from importlib.metadata import version
from pathlib import Path
from time import perf_counter
from typing import Annotated, Literal, TypedDict

import numpy as np
import yaml
from pydantic import Field

from scm.config.loader import load_study
from scm.config.models import Positive, PositiveInt
from scm.contracts import Contract, Fraction
from scm.demand.generator import demand, draw_streams
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.multi_echelon import simulate_network


class PoolingSettings(Contract):
    sites: PositiveInt
    blocks: PositiveInt
    lead_days: PositiveInt
    daily_mean: Positive
    daily_std: Positive
    target_csl: Annotated[float, Field(gt=0.5, lt=1)]
    correlations: list[Fraction] = Field(min_length=1)
    ratio_tolerance: Positive


class BenchmarkSettings(Contract):
    dc_count: Literal[1, 2, 4, 8]
    replications: PositiveInt
    workers: PositiveInt
    single_seconds_limit: Positive
    parallel_seconds_limit: Positive


class ValidationSettings(Contract):
    seed: Annotated[int, Field(ge=0)]
    pooling: PoolingSettings
    benchmark: BenchmarkSettings


class PoolingRow(TypedDict):
    rho: float
    separate_safety_stock: float
    pooled_safety_stock: float
    observed_ratio: float
    expected_ratio: float
    absolute_error: float
    passed: bool


class ReplicationRow(TypedDict):
    seed: int
    elapsed_seconds: float
    measured_cost_inr: float
    fill_rate: float
    days: int
    skus: int
    customers: int


def load_validation() -> ValidationSettings:
    return ValidationSettings.model_validate(
        yaml.safe_load(Path("configs/m3_validation.yaml").read_text(encoding="utf-8"))
    )


def pooling_validation(config: ValidationSettings) -> list[PoolingRow]:
    p = config.pooling
    streams = draw_streams(config.seed, p.blocks * p.lead_days, 1, p.sites)
    rows: list[PoolingRow] = []
    for rho in p.correlations:
        draws = demand(
            streams,
            np.full((1, p.sites), p.daily_mean),
            np.full((1, p.sites), p.daily_std),
            regional_rho=rho,
        )
        protection = draws.reshape(p.blocks, p.lead_days, p.sites).sum(axis=1)
        separate = float(
            (np.quantile(protection, p.target_csl, axis=0) - p.daily_mean * p.lead_days).sum()
        )
        pooled = float(
            np.quantile(protection.sum(axis=1), p.target_csl) - p.sites * p.daily_mean * p.lead_days
        )
        expected = float(np.sqrt((1 + (p.sites - 1) * rho) / p.sites))
        ratio = pooled / separate
        error = abs(ratio - expected)
        rows.append(
            PoolingRow(
                rho=rho,
                separate_safety_stock=separate,
                pooled_safety_stock=pooled,
                observed_ratio=ratio,
                expected_ratio=expected,
                absolute_error=error,
                passed=error <= p.ratio_tolerance,
            )
        )
    return rows


def _replication(args: tuple[int, Literal[1, 2, 4, 8]]) -> ReplicationRow:
    seed, count = args
    start = perf_counter()
    study = load_study()
    study.scenario.network.dc_count = count
    net = build_network(study.spec, study.scenario)
    days = study.scenario.horizon_days + study.scenario.warmup_days
    usage, leads = network_inputs(net, study.seasonality, seed, days)
    result = simulate_network(net, usage, leads, warmup_days=study.scenario.warmup_days)
    measured = slice(study.scenario.warmup_days, None)
    measured_cost = float(result.measured_cost.sum())
    fill_rate = float(result.immediate[measured].sum() / usage[measured].sum())
    return ReplicationRow(
        seed=seed,
        elapsed_seconds=perf_counter() - start,
        measured_cost_inr=measured_cost,
        fill_rate=fill_rate,
        days=days,
        skus=len(study.spec.skus),
        customers=len(study.spec.customers),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/evidence/m3"))
    args = parser.parse_args()
    config = load_validation()
    pool = pooling_validation(config)
    b = config.benchmark
    seeds = [
        int(child.generate_state(1)[0])
        for child in np.random.SeedSequence(config.seed).spawn(b.replications)
    ]
    single = _replication((seeds[0], b.dc_count))
    # Each worker uses one BLAS thread; the measured pool includes Windows process startup.
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    os.environ["OMP_NUM_THREADS"] = "1"
    start = perf_counter()
    with ProcessPoolExecutor(max_workers=b.workers) as executor:
        replications = list(executor.map(_replication, [(seed, b.dc_count) for seed in seeds]))
    parallel_seconds = perf_counter() - start
    reproducible = (
        single["measured_cost_inr"] == replications[0]["measured_cost_inr"]
        and single["fill_rate"] == replications[0]["fill_rate"]
    )
    passed = (
        all(r["passed"] for r in pool)
        and reproducible
        and single["elapsed_seconds"] < b.single_seconds_limit
        and parallel_seconds < b.parallel_seconds_limit
    )
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    results = {
        "milestone": "M3",
        "passed": passed,
        "pooling": pool,
        "benchmark": {
            "single": single,
            "parallel_seconds": parallel_seconds,
            "workers": b.workers,
            "replications": replications,
            "serial_parallel_reproducible": reproducible,
        },
        "limitations": [
            "Synthetic known-demand network; forecasting starts in M4.",
            "Segmentation and bullwhip flags are reserved for M4/M5; disruptions rejected.",
            "V5 tests protection-demand tails, not constrained network service levels.",
            "90-day network warm-up and nominal service targets are not calibrated.",
        ],
    }
    results_path = output / "results.json"
    results_path.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    source_paths = sorted(Path("engine/src/scm").rglob("*.py"))
    config_paths = sorted(Path("configs").glob("*.yaml"))
    hashes = {
        str(p).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in source_paths + config_paths
    }
    try:
        git = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
        git_sha = git.stdout.strip() if git.returncode == 0 else None
    except FileNotFoundError:
        git_sha = None
    manifest = {
        "command": "python -m scm.sim.validate_network",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "logical_cpus": os.cpu_count(),
        "versions": {p: version(p) for p in ("numpy", "scipy", "pydantic", "PyYAML")},
        "git_sha": git_sha,
        "input_sha256": hashes,
        "results_sha256": hashlib.sha256(results_path.read_bytes()).hexdigest(),
        "validation_settings": config.model_dump(),
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": passed,
                "single_seconds": single["elapsed_seconds"],
                "parallel_seconds": parallel_seconds,
                "output": str(output),
            },
            indent=2,
        )
    )
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
