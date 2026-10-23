"""Local, single-server run cache; completed artifacts are immutable."""

import errno
import hashlib
import json
import logging
import re
import sys
import threading
import time
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import yaml
from fastapi import HTTPException
from joblib import Parallel, delayed, parallel_config
from scm.config.api import ApiSettings
from scm.config.bullwhip import BullwhipSettings, load_bullwhip
from scm.config.lab import configure_planning, configure_study
from scm.config.loader import Study, load_study
from scm.config.mitigation import MitigationSettings
from scm.config.planning import PlanningSettings, load_planning
from scm.contracts import (
    Comparison,
    Estimate,
    Health,
    Kpis,
    Network,
    RunDiagnostics,
    RunNetwork,
    RunRequest,
    RunStatus,
    Scenario,
    SeriesMetric,
    TimeSeries,
)
from scm.demand.generator import FloatArray
from scm.experiments.stats import estimate, paired_difference
from scm.metrics.diagnostics import diagnostics
from scm.metrics.kpis import replication_kpis
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.disruptions import compile_disruptions
from scm.sim.multi_echelon import simulate_network

LOGGER = logging.getLogger(__name__)


def nullable(values: FloatArray) -> Any:
    if values.ndim == 1:
        return [float(v) if np.isfinite(v) else None for v in values]
    return [nullable(row) for row in values]


def write_json(path: Path, data: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    for attempt in range(5):
        try:
            temporary.replace(path)
            return
        except PermissionError as error:
            if getattr(error, "winerror", None) not in {5, 32, 33} or attempt == 4:
                raise
            # Windows readers briefly deny replacement of an otherwise writable file.
            time.sleep(0.01 * (attempt + 1))


def interval(values: list[float | None]) -> Estimate:
    result = estimate(values)
    low, high = result["low"], result["high"]
    return Estimate(
        mean=result["mean"], ci95=[low, high] if low is not None and high is not None else None
    )


@dataclass
class Sample:
    metrics: dict[str, FloatArray]
    costs: FloatArray
    arrays: dict[str, FloatArray] | None
    network: Network | None
    sku_ids: list[str]
    diagnostics: RunDiagnostics | None = None


def sample_run(
    study: Study,
    scenario: Scenario,
    request: RunRequest,
    settings: ApiSettings,
    planning_settings: PlanningSettings,
    bullwhip_settings: BullwhipSettings,
    seed: int,
    training_seed: int,
    run_id: str,
    representative: bool,
) -> Sample:
    study = configure_study(
        Study(
            scenario,
            request.model.spec if request.model else study.spec,
            request.model.seasonality if request.model else study.seasonality,
        ),
        request.lab,
    )
    planning_settings = configure_planning(planning_settings, request.lab)
    net = build_network(study.spec, scenario)
    usage, leads = network_inputs(
        net, study.seasonality, seed, scenario.warmup_days + scenario.horizon_days
    )
    options = request.options
    planning = None
    if (
        options.forecasting
        or options.segmented
        or (options.bullwhip and scenario.bullwhip.signal_processing)
    ):
        planning = planning_settings.model_copy(deep=True)
        planning.segmented = options.segmented
    history = None
    if planning is not None:
        history, _ = network_inputs(net, study.seasonality, training_seed, settings.training_days)
    result = simulate_network(
        net,
        usage,
        leads,
        warmup_days=scenario.warmup_days,
        planning=planning,
        demand_history=history,
        bullwhip=bullwhip_settings if options.bullwhip else None,
        lost_sales=options.lost_sales,
        log_source_service=True,
        mitigation=MitigationSettings.model_validate(
            request.lab.model_dump(
                include={"buffer_days", "expedite_factor", "expedite_unit_cost", "backup_suppliers"}
            )
        ),
    )
    metrics, costs, arrays = replication_kpis(net, result, settings)
    network = None
    if representative:
        arrays.update(
            orders=result.orders,
            received=result.received,
            forecast=result.forecast.copy()
            if result.forecast is not None
            else np.full_like(result.on_hand, np.nan),
        )
        arrays["forecast"][:, :, net.is_supplier] = np.nan
        arrays["reorder_point"] = net.reorder.copy()
        arrays["order_quantity"] = net.quantity.copy()
        network = net.as_contract(run_id)
        network.edges.flow_units = (
            result.edge_shipped[scenario.warmup_days :].sum(axis=(0, 1)).tolist()
        )
    return Sample(
        metrics,
        costs,
        arrays if representative else None,
        network,
        [s.id for s in study.spec.skus],
        diagnostics(net, result, run_id, seed, expedite_unit_cost=request.lab.expedite_unit_cost)
        if representative
        else None,
    )


class RunStore:
    def __init__(self, root: Path, settings: ApiSettings):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.settings = settings
        self.study = load_study()
        self.planning = load_planning()
        self.bullwhip = load_bullwhip()
        paths = sorted(
            set(Path("engine/src/scm").rglob("*.py"))
            | set(Path("api").rglob("*.py"))
            | set(Path("configs").glob("*.yaml"))
            | {Path("requirements-dev.lock")}
        )
        self.fingerprint = {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
        self.versions = {
            name: version(name)
            for name in ("numpy", "scipy", "pydantic", "pyarrow", "duckdb", "fastapi")
        }
        self.lock = threading.RLock()
        self.execution = threading.Lock()
        self.pending: set[str] = set()
        for path in self.root.glob("*/status.json"):
            status = RunStatus.model_validate_json(path.read_text())
            if status.status in {"queued", "running"}:
                status.status = "failed"
                status.error = (
                    "Server restarted before this run completed; submit it again to retry."
                )
                write_json(path, status.model_dump())

    def directory(self, run_id: str) -> Path:
        if re.fullmatch(r"[a-f0-9]{64}", run_id) is None:
            raise HTTPException(404, "Unknown run")
        path = (self.root / run_id).resolve()
        if not path.is_relative_to(self.root):
            raise HTTPException(404, "Unknown run")
        return path

    def status(self, run_id: str) -> RunStatus:
        path = self.directory(run_id) / "status.json"
        if not path.is_file():
            raise HTTPException(404, "Unknown run")
        attempt = 0
        while True:
            try:
                return RunStatus.model_validate_json(path.read_text(encoding="utf-8"))
            except PermissionError as error:
                attempt += 1
                windows_lock = getattr(error, "winerror", None) in {5, 32, 33} or (
                    sys.platform == "win32" and error.errno == errno.EACCES
                )
                if not windows_lock or attempt >= 5:
                    raise
                # Windows CRT can expose a sharing violation as EACCES without winerror.
                time.sleep(0.01 * attempt)

    def ready(self, run_id: str) -> Path:
        status = self.status(run_id)
        if status.status != "complete":
            raise HTTPException(409, f"Run is {status.status}")
        return self.directory(run_id)

    def resolve(self, request: RunRequest) -> tuple[Scenario, Study]:
        if request.preset != "base_4dc":
            raise HTTPException(404, "Unknown scenario preset")
        data = self.study.scenario.model_dump()
        if request.model:
            spec = request.model.spec
            data["network"] = {
                "suppliers": [supplier.id for supplier in spec.suppliers],
                "dc_count": len(spec.open_dcs)
                if spec.open_dcs
                else min(data["network"]["dc_count"], len(spec.dcs)),
            }
        for name, value in request.overrides.model_dump(
            exclude_unset=True, exclude_none=True
        ).items():
            data[name] = data[name] | value if isinstance(value, dict) else value
        data["replications"] = request.replications
        try:
            scenario = Scenario.model_validate(data)
            if (
                request.replications > self.settings.max_replications
                or scenario.horizon_days > self.settings.max_horizon_days
                or scenario.warmup_days > self.settings.max_warmup_days
            ):
                raise ValueError("Requested replications or horizon exceed the local API limits")
            effective = configure_study(
                Study(
                    scenario,
                    request.model.spec if request.model else self.study.spec,
                    request.model.seasonality if request.model else self.study.seasonality,
                ),
                request.lab,
            )
            if request.model:
                limits = yaml.safe_load(Path("configs/builder.yaml").read_text(encoding="utf-8"))
                count = (
                    len(effective.spec.suppliers)
                    + scenario.network.dc_count
                    + len(effective.spec.customers)
                )
                if (
                    count
                    * len(effective.spec.skus)
                    * (scenario.warmup_days + scenario.horizon_days)
                    > limits["max_observation_cells"]
                ):
                    raise ValueError(
                        "Custom model exceeds the daily observation budget; "
                        "reduce facilities, SKUs or days"
                    )
            configure_planning(self.planning, request.lab)
            net = build_network(effective.spec, scenario)
            net.as_contract("preview")
            if scenario.disruptions:
                compile_disruptions(net, scenario.warmup_days + scenario.horizon_days)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return scenario, effective

    def manifest(self, request: RunRequest) -> dict[str, Any]:
        # Normalize numeric defaults identically before and after a JSON round trip.
        request = RunRequest.model_validate(request.model_dump())
        scenario, effective = self.resolve(request)
        payload = {
            "request": request.model_dump(),
            "scenario": scenario.model_dump(),
            "settings": self.settings.model_dump(),
            "input_sha256": self.fingerprint,
            "versions": self.versions,
            "lab": request.lab.model_dump(),
            "operating_snapshot": {
                "network": effective.spec.model_dump(),
                "seasonality": effective.seasonality.model_dump(),
                "planning": configure_planning(self.planning, request.lab)
                .model_copy(update={"segmented": request.options.segmented})
                .model_dump(),
                "planning_enabled": request.options.forecasting
                or request.options.segmented
                or (request.options.bullwhip and scenario.bullwhip.signal_processing),
                "bullwhip": self.bullwhip.model_dump(),
            },
        }
        identity = {key: value for key, value in payload.items() if key != "request"} | {
            "seed": request.seed,
            "replications": request.replications,
            "options": request.options.model_dump(),
        }
        run_id = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        children = np.random.SeedSequence(request.seed).spawn(2)
        seeds = [int(s.generate_state(1)[0]) for s in children[1].spawn(request.replications)]
        return payload | {
            "run_id": run_id,
            "replication_seeds": seeds,
            "training_seed": int(children[0].generate_state(1)[0]),
        }

    def reserve_pair(self, a: RunRequest, b: RunRequest) -> list[tuple[RunStatus, bool]]:
        manifests = [self.manifest(a), self.manifest(b)]
        with self.lock:
            needed = set()
            for manifest in manifests:
                identity = manifest["run_id"]
                path = self.directory(identity) / "status.json"
                if not path.is_file() or self.status(identity).status == "failed":
                    needed.add(identity)
            if len(self.pending) + len(needed) > self.settings.max_pending_runs:
                raise HTTPException(
                    503, "Local run queue cannot accept both conditions; retry later"
                )
            return [self.reserve(a), self.reserve(b)]

    def reserve(self, request: RunRequest) -> tuple[RunStatus, bool]:
        payload = self.manifest(request)
        run_id = payload["run_id"]
        seeds = payload["replication_seeds"]
        with self.lock:
            folder = self.directory(run_id)
            if (folder / "status.json").is_file():
                existing = self.status(run_id)
                if existing.status != "failed":
                    return existing, False
            if len(self.pending) >= self.settings.max_pending_runs:
                raise HTTPException(503, "Local run queue is full; retry after a run completes")
            folder.mkdir(exist_ok=True)
            status = RunStatus(
                run_id=run_id,
                status="queued",
                seed=request.seed,
                replications=request.replications,
                representative_seed=seeds[0],
            )
            write_json(folder / "request.json", request.model_dump())
            write_json(folder / "scenario.json", payload["scenario"])
            write_json(folder / "manifest.json", payload)
            write_json(folder / "status.json", status.model_dump())
            self.pending.add(run_id)
            return status, True

    def compute(self, run_id: str) -> None:
        with self.execution:
            folder = self.directory(run_id)
            status = self.status(run_id)
            status.status = "running"
            write_json(folder / "status.json", status.model_dump())
            try:
                request = RunRequest.model_validate_json((folder / "request.json").read_text())
                scenario = Scenario.model_validate_json((folder / "scenario.json").read_text())
                manifest = json.loads((folder / "manifest.json").read_text())
                metrics: dict[str, list[Any]] = {}
                costs = []
                with parallel_config(backend="loky", inner_max_num_threads=1):
                    batches = Parallel(
                        n_jobs=min(self.settings.workers, request.replications),
                        return_as="generator",
                        pre_dispatch=self.settings.workers,
                        batch_size=1,
                    )(
                        delayed(sample_run)(
                            self.study,
                            scenario,
                            request,
                            self.settings,
                            self.planning,
                            self.bullwhip,
                            seed,
                            manifest["training_seed"],
                            run_id,
                            index == 0,
                        )
                        for index, seed in enumerate(manifest["replication_seeds"])
                    )
                    for sample in batches:
                        for name, values in sample.metrics.items():
                            metrics.setdefault(name, []).append(nullable(values))
                        costs.append(sample.costs.tolist())
                        if sample.arrays is not None and sample.network is not None:
                            self.save_representative(folder, sample, scenario)
                write_json(
                    folder / "samples.json",
                    {"metrics": metrics, "costs": costs, "seeds": manifest["replication_seeds"]},
                )
                manifest["output_sha256"] = {
                    name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
                    for name in (
                        "arrays.npz",
                        "nodes.parquet",
                        "network.json",
                        "health.json",
                        "samples.json",
                        "diagnostics.json",
                    )
                }
                write_json(folder / "manifest.json", manifest)
                status.status = "complete"
            except Exception:
                LOGGER.exception("Run %s failed", run_id)
                status.status = "failed"
                status.error = "Run computation failed; inspect the local server log and retry."
            finally:
                write_json(folder / "status.json", status.model_dump())
                with self.lock:
                    self.pending.discard(run_id)

    def save_representative(self, folder: Path, sample: Sample, scenario: Scenario) -> None:
        if sample.diagnostics is not None:
            write_json(folder / "diagnostics.json", sample.diagnostics.model_dump())
        assert sample.arrays is not None and sample.network is not None
        arrays = sample.arrays
        np.savez_compressed(
            folder / "arrays.tmp.npz",
            allow_pickle=False,
            on_hand=arrays["on_hand"],
            on_order=arrays["on_order"],
            backorders=arrays["backorders"],
            fill_rate=arrays["fill_rate"],
            days_of_cover=arrays["days_of_cover"],
            demand=arrays["demand"],
            immediate=arrays["immediate"],
            orders=arrays["orders"],
            received=arrays["received"],
            forecast=arrays["forecast"],
        )
        (folder / "arrays.tmp.npz").replace(folder / "arrays.npz")
        network = sample.network
        write_json(
            folder / "network.json",
            {
                "network": network.model_dump(),
                "sku_ids": sample.sku_ids,
                "warmup_days": scenario.warmup_days,
                "policy": {
                    "basis": "nominal_initial_targets",
                    "reorder_point": arrays["reorder_point"].tolist(),
                    "order_quantity": arrays["order_quantity"].tolist(),
                },
            },
        )
        count = len(network.nodes.id)
        days = scenario.warmup_days + scenario.horizon_days
        columns = {
            "day": pa.array(np.repeat(np.arange(days), count)),
            "node_id": pa.array(network.nodes.id * days),
            "node_type": pa.array(network.nodes.type * days),
        }
        for metric in ("on_hand", "on_order", "backorders", "fill_rate", "days_of_cover"):
            columns[metric] = pa.array(arrays[f"node_{metric}"].ravel(), from_pandas=True)
        pq.write_table(pa.table(columns), folder / "nodes.parquet", compression="zstd")
        health = Health(
            run_id=network.run_id,
            days=list(range(days)),
            node_ids=network.nodes.id,
            days_of_cover=nullable(arrays["node_days_of_cover"].T),
            stockout=(arrays["node_stockout"].T > 0).tolist(),
        )
        write_json(folder / "health.json", health.model_dump())

    def kpis(self, run_id: str, node: str | None = None) -> Kpis:
        folder = self.ready(run_id)
        network = json.loads((folder / "network.json").read_text())["network"]
        nodes = network["nodes"]["id"]
        if node is not None and node not in nodes:
            raise HTTPException(404, "Unknown node")
        column = len(nodes) if node is None else nodes.index(node)
        data = json.loads((folder / "samples.json").read_text())
        estimates = {
            name: interval([row[column] for row in values]).model_dump()
            for name, values in data["metrics"].items()
        }
        return Kpis.model_validate(
            dict(run_id=run_id, node_id=node, replications=len(data["seeds"]), metrics=estimates)
        )

    def network(self, run_id: str) -> RunNetwork:
        folder = self.ready(run_id)
        data = json.loads((folder / "network.json").read_text())
        if data.get("warmup_days") is None:
            data["warmup_days"] = Scenario.model_validate_json(
                (folder / "scenario.json").read_text()
            ).warmup_days
        return RunNetwork.model_validate(data | {"kpis": self.kpis(run_id).model_dump()})

    def timeseries(
        self,
        run_id: str,
        node: str,
        sku: str,
        metrics: list[SeriesMetric],
        start_day: int | None,
        end_day: int | None,
    ) -> TimeSeries:
        folder = self.ready(run_id)
        network = self.network(run_id)
        if node not in network.network.nodes.id or sku not in network.sku_ids:
            raise HTTPException(404, "Unknown node or SKU")
        scenario = Scenario.model_validate_json((folder / "scenario.json").read_text())
        start = scenario.warmup_days if start_day is None else start_day
        end = scenario.warmup_days + scenario.horizon_days - 1 if end_day is None else end_day
        if not 0 <= start <= end < scenario.warmup_days + scenario.horizon_days:
            raise HTTPException(422, "Day bounds must be ordered and within the simulation")
        if not metrics or len(set(metrics)) != len(metrics):
            raise HTTPException(422, "Select distinct supported metrics")
        i, j = network.sku_ids.index(sku), network.network.nodes.id.index(node)
        with np.load(folder / "arrays.npz", allow_pickle=False) as arrays:
            if any(name not in arrays for name in metrics):
                raise HTTPException(
                    409,
                    "This historical run has no selected daily evidence. "
                    "Rerun the request with the current engine.",
                )
            values = {name: nullable(arrays[name][start : end + 1, i, j]) for name in metrics}
        return TimeSeries(
            run_id=run_id,
            node_id=node,
            sku_id=sku,
            days=list(range(start, end + 1)),
            metrics=values,
        )

    def compare(self, a: str, b: str) -> Comparison:
        folders = [self.ready(run_id) for run_id in (a, b)]
        manifests = [json.loads((folder / "manifest.json").read_text()) for folder in folders]
        if (
            manifests[0]["input_sha256"] != manifests[1]["input_sha256"]
            or manifests[0]["versions"] != manifests[1]["versions"]
        ):
            raise HTTPException(
                409,
                "Paired comparison requires the same model/config snapshot. Rerun both requests.",
            )
        samples = [json.loads((p / "samples.json").read_text()) for p in folders]
        snapshots = [
            (manifest.get("operating_snapshot") or {}).get("network") for manifest in manifests
        ]
        if all(snapshots):
            identities = [
                [
                    [row["id"] for row in snapshot[kind]]
                    for kind in ("suppliers", "dcs", "customers", "skus")
                ]
                for snapshot in snapshots
                if snapshot is not None
            ]
            if identities[0] != identities[1]:
                raise HTTPException(
                    409,
                    "Paired comparison requires matching ordered facility and SKU identities. "
                    "Compare parameter or routing changes within the same model.",
                )
        scenarios = [
            Scenario.model_validate_json((p / "scenario.json").read_text()) for p in folders
        ]
        if (
            samples[0]["seeds"] != samples[1]["seeds"]
            or scenarios[0].warmup_days != scenarios[1].warmup_days
            or scenarios[0].horizon_days != scenarios[1].horizon_days
        ):
            raise HTTPException(
                409, "Paired comparison requires matching replication seeds and day windows"
            )
        seeds = samples[0]["seeds"]

        def difference(x: list[float | None], y: list[float | None]) -> Estimate:
            result = paired_difference(dict(zip(seeds, x)), dict(zip(seeds, y)))
            low, high = result["low"], result["high"]
            return Estimate(
                mean=result["mean"],
                ci95=[low, high] if low is not None and high is not None else None,
            )

        metrics = {
            name: difference(
                [row[-1] for row in samples[0]["metrics"][name]],
                [row[-1] for row in samples[1]["metrics"][name]],
            )
            for name in samples[0]["metrics"]
        }
        components = [
            "purchase",
            "inbound_freight",
            "outbound_freight",
            "holding",
            "ordering",
            "dc_fixed",
            "shortage",
            "handling",
        ]
        columns: dict[str, list[Any]] = {
            key: [] for key in ("a", "b", "delta", "ci95_low", "ci95_high")
        }
        for i, _ in enumerate(components):
            x, y = ([row[i] for row in sample["costs"]] for sample in samples)
            delta = difference(x, y)
            columns["a"].append(estimate(x)["mean"])
            columns["b"].append(estimate(y)["mean"])
            columns["delta"].append(delta.mean)
            columns["ci95_low"].append(delta.ci95[0] if delta.ci95 else None)
            columns["ci95_high"].append(delta.ci95[1] if delta.ci95 else None)
        return Comparison.model_validate(
            dict(
                run_a=a,
                run_b=b,
                replications=len(seeds),
                metrics={k: v.model_dump() for k, v in metrics.items()},
                costs={"component": components, **columns},
            )
        )
