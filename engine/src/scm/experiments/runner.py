"""Run a YAML experiment grid with stable seeds, row ordering and Parquet encoding."""

import hashlib
import json
import platform
import subprocess
from collections import defaultdict
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import typer
from joblib import Parallel, delayed, parallel_config

from scm.contracts import ExperimentRow
from scm.experiments.design import Case, ExperimentSpec, case, expand_grid, load_spec
from scm.experiments.replication import replication
from scm.experiments.stats import estimate, paired_difference

__all__ = ["expand_grid", "load_spec", "run_experiment"]


def _seeds(spec: ExperimentSpec, experiment: str, phase: str, count: int) -> list[int]:
    phase_id = ["calibration", "screen", "confirm", "evaluation"].index(phase) + 1
    return [
        int(s.generate_state(1)[0])
        for s in np.random.SeedSequence([spec.seed, int(experiment[1]), phase_id]).spawn(count)
    ]


def _run(
    spec: ExperimentSpec, experiment: str, cases: list[Case], phase: str, count: int, workers: int
) -> list[ExperimentRow]:
    seeds = _seeds(spec, experiment, phase, count)
    with parallel_config(backend="loky", inner_max_num_threads=1):
        batches = Parallel(n_jobs=workers)(
            delayed(replication)(spec, experiment, c, phase, i, seed)
            for c in cases
            for i, seed in enumerate(seeds)
        )
    return [row for batch in batches for row in batch]


def _mean(rows: list[ExperimentRow], case_id: str, metric: str) -> float:
    values = [
        r.value for r in rows if r.case_id == case_id and r.metric == metric and r.value is not None
    ]
    if not values:
        raise ValueError(f"missing metric {metric} for {case_id}")
    return float(np.mean(values))


def _confirm_cases(
    spec: ExperimentSpec, cases: list[Case], rows: list[ExperimentRow]
) -> list[Case]:
    blocks: dict[str, list[Case]] = defaultdict(list)
    for c in cases:
        blocks[
            json.dumps({k: v for k, v in c.factors.items() if k != "dc_count"}, sort_keys=True)
        ].append(c)
    selected = []
    for block in blocks.values():
        scores = [(c, _mean(rows, c.case_id, "landed_cost_inr")) for c in block]
        best = min(v for _, v in scores)
        near = [c for c, v in scores if v <= best * (1 + spec.e3.break_even_fraction)]
        if len(near) > 1:
            selected.extend(near)
    return selected


def _e1(output: Path) -> list[ExperimentRow]:
    import yaml

    from scm.sim.validate import Benchmark, run_validation

    config_path = Path("configs/m2_validation.yaml")
    cfg = Benchmark.model_validate(yaml.safe_load(config_path.read_text()))
    results = run_validation(config_path, output / "validation")
    if not all(c["passed"] for c in results["checks"].values()):
        raise ValueError("E1 validation failed")
    rows = []
    for name, check in results["checks"].items():
        if name.startswith(("V1", "V2", "V3", "V4")):
            for metric in ("actual", "expected", "tolerance"):
                rows.append(
                    ExperimentRow(
                        experiment="E1",
                        case_id=name,
                        phase="validation",
                        replication=0,
                        seed=cfg.seed,
                        metric=metric,
                        value=float(check[metric]),
                    )
                )
    sweep = np.loadtxt(output / "validation/q_sweep.csv", delimiter=",", skiprows=1)
    seeds = [
        int(s.generate_state(1)[0])
        for s in np.random.SeedSequence(cfg.seed).spawn(cfg.replications)
    ]
    for q_index, values in enumerate(sweep):
        for i, value in enumerate(values[1:]):
            for metric, amount in (("quantity", values[0]), ("inventory_cost_inr", value)):
                rows.append(
                    ExperimentRow(
                        experiment="E1",
                        case_id=f"q_{q_index}",
                        phase="validation",
                        replication=i,
                        seed=seeds[i],
                        metric=metric,
                        value=float(amount),
                    )
                )
    return rows


def _summarize(rows: list[ExperimentRow], cases: list[Case], experiment: str) -> dict[str, object]:
    groups: dict[tuple[str, str, str], dict[int, float | None]] = defaultdict(dict)
    for r in rows:
        groups[r.phase, r.case_id, r.metric][r.seed] = r.value
    summary = [
        {"phase": p, "case_id": c, "metric": m, **estimate(list(v.values()))}
        for (p, c, m), v in sorted(groups.items())
    ]
    paired: list[dict[str, object]] = []
    lookup = {json.dumps(c.factors, sort_keys=True): c.case_id for c in cases}
    for c in cases:
        reference = c.factors.copy()
        if experiment == "E3":
            reference["dc_count"] = 1
        elif experiment == "E4":
            reference.update(
                {name: False for name in ("signal_processing", "batching", "price", "rationing")}
            )
        elif experiment == "E5":
            reference.update(segmented=False, offset=0.0)
        elif experiment == "E6":
            reference["mitigation"] = "none"
        else:
            continue
        baseline = lookup.get(json.dumps(reference, sort_keys=True))
        if baseline is None or baseline == c.case_id:
            continue
        for (phase, case_id, metric), values in groups.items():
            ref = groups.get((phase, baseline, metric))
            if case_id == c.case_id and ref is not None:
                paired.append(
                    {
                        "phase": phase,
                        "case_id": case_id,
                        "baseline": baseline,
                        "metric": metric,
                        **paired_difference(ref, values),
                    }
                )
    return {"estimates": summary, "paired_differences": paired}


def write_results(output: Path, rows: list[ExperimentRow]) -> str:
    ordered = sorted(rows, key=lambda r: (r.phase, r.case_id, r.replication, r.metric))
    keys = [(r.phase, r.case_id, r.replication, r.metric) for r in ordered]
    if len(set(keys)) != len(keys):
        raise ValueError("duplicate experiment row keys")
    schema = pa.schema(
        [
            (
                name,
                pa.int64()
                if name in {"replication", "seed"}
                else pa.float64()
                if name == "value"
                else pa.string(),
            )
            for name in ExperimentRow.model_fields
        ]
    )
    table = pa.Table.from_pylist([r.model_dump() for r in ordered], schema=schema)
    pq.write_table(
        table,
        output / "results.parquet",
        compression="NONE",
        use_dictionary=False,
        version="2.6",
        row_group_size=65536,
        write_statistics=True,
    )
    return hashlib.sha256((output / "results.parquet").read_bytes()).hexdigest()


def run_experiment(
    spec: ExperimentSpec, experiment: str, output: Path, *, workers: int
) -> dict[str, Any]:
    if workers < 1:
        raise ValueError("workers must be positive")
    spec = ExperimentSpec.model_validate(spec.model_dump())
    cases = expand_grid(spec, experiment)
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").unlink(missing_ok=True)
    details: dict[str, object] = {}
    if experiment == "E1":
        rows = _e1(output)
    elif experiment == "E3":
        rows = _run(spec, experiment, cases, "screen", spec.e3.screen_replications, workers)
        confirmation = _confirm_cases(spec, cases, rows)
        details["confirmed_case_ids"] = [c.case_id for c in confirmation]
        rows += _run(
            spec, experiment, confirmation, "confirm", spec.e3.confirm_replications, workers
        )
    elif experiment == "E5":
        candidates = [cases[0]] + [
            case(experiment, segmented=True, offset=v) for v in spec.e5.offsets
        ]
        calibration = _run(
            spec, experiment, candidates, "calibration", spec.e5.calibration_replications, workers
        )
        target = _mean(calibration, cases[0].case_id, "fill_rate")
        selected = min(
            candidates[1:],
            key=lambda c: (
                abs(_mean(calibration, c.case_id, "fill_rate") - target),
                abs(float(c.factors["offset"])),
            ),
        )
        cases = [cases[0], selected]
        rows = calibration + _run(spec, experiment, cases, "evaluation", spec.replications, workers)
        evaluation = [r for r in rows if r.phase == "evaluation"]
        details["selected_offset"] = selected.factors["offset"]
        service_gap = _mean(evaluation, selected.case_id, "fill_rate") - _mean(
            evaluation, cases[0].case_id, "fill_rate"
        )
        details["service_gap"] = service_gap
        details["service_matched"] = abs(service_gap) <= spec.e5.service_tolerance
        cases = candidates
    else:
        rows = _run(spec, experiment, cases, "evaluation", spec.replications, workers)
    digest = write_results(output, rows)
    stored = [
        ExperimentRow.model_validate(row)
        for row in pq.read_table(output / "results.parquet").to_pylist()
    ]
    summary = _summarize(stored, cases, experiment) | details
    (output / "summary.json").write_text(
        json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    from scm.experiments.figures import plot_experiment

    plot_experiment(output, experiment, cases, stored)
    paths = sorted(
        set(Path("engine/src/scm").rglob("*.py"))
        | set(Path("configs").glob("*.yaml"))
        | set(Path("contracts").glob("*.schema.json"))
        | {Path("requirements-dev.lock"), Path("pyproject.toml"), Path(spec.e6.events_config)}
    )
    sources = {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    config_hash = hashlib.sha256(
        json.dumps(
            {"experiment": experiment, "spec": spec.model_dump(), "inputs": sources}, sort_keys=True
        ).encode()
    ).hexdigest()
    try:
        git = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
        git_sha = git.stdout.strip() if git.returncode == 0 else None
    except FileNotFoundError:
        git_sha = None
    manifest = {
        "experiment": experiment,
        "config_hash": config_hash,
        "parquet_sha256": digest,
        "python": platform.python_version(),
        "git_sha": git_sha,
        "workers": workers,
        "versions": {
            p: version(p)
            for p in (
                "numpy",
                "scipy",
                "pydantic",
                "PyYAML",
                "pyarrow",
                "joblib",
                "typer",
                "matplotlib",
            )
        },
        "input_sha256": sources,
        "settings": spec.model_dump(),
        "cases": [c.model_dump() for c in cases],
        "row_count": len(rows),
        "output_sha256": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in output.iterdir()
            if p.is_file() and p.name != "manifest.json"
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(
    experiment: str,
    output: Path = Path("data/experiments"),
    config: Path = Path("configs/experiments.yaml"),
    workers: int = 0,
    replications: int = 0,
    screen: int = 0,
    confirm: int = 0,
) -> None:
    spec = load_spec(config)
    if replications:
        spec.replications = replications
    if screen:
        spec.e3.screen_replications = screen
    if confirm:
        spec.e3.confirm_replications = confirm
    result = run_experiment(spec, experiment, output / experiment, workers=workers or spec.workers)
    print(
        json.dumps({k: result[k] for k in ("experiment", "row_count", "parquet_sha256")}, indent=2)
    )


if __name__ == "__main__":
    typer.run(main)
