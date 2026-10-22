"""Export M10 teaching views from recorded experiments and seeded representative runs."""

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow.parquet as pq
import yaml
from fastapi.testclient import TestClient
from joblib import Parallel, delayed, parallel_config

from api.app.main import create_app
from scm.analytics.eoq import eoq
from scm.config.bullwhip import load_bullwhip
from scm.config.loader import load_study
from scm.config.planning import load_planning
from scm.contracts import BullwhipConfig, ObservationSeries, StudyDefaults, StudyEvidence
from scm.experiments.design import Case, ExperimentSpec
from scm.experiments.e6_validate import load_validation
from scm.metrics.bullwhip import aggregate_periods, bullwhip_ratio, echelon_series
from scm.metrics.resilience import paired_resilience, rolling_fill
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.disruptions import affected_customers
from scm.sim.engine import simulate
from scm.sim.multi_echelon import simulate_network
from scm.sim.validate import Benchmark, policy, samples


def read(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def finite(values: np.ndarray[Any, Any]) -> list[float | None]:
    return [float(v) if np.isfinite(v) else None for v in values]


def bullwhip_trace(
    case: Case, spec: ExperimentSpec, seed: int
) -> tuple[str, dict[str, Any], float]:
    study = load_study()
    study.scenario.warmup_days, study.scenario.horizon_days = spec.warmup_days, spec.horizon_days
    study.scenario.bullwhip = BullwhipConfig.model_validate(
        {key: case.factors[key] for key in BullwhipConfig.model_fields}
    )
    net = build_network(study.spec, study.scenario)
    usage, leads = network_inputs(
        net, study.seasonality, seed, spec.warmup_days + spec.horizon_days
    )
    training_seed = int(np.random.SeedSequence([spec.seed, 4, 0]).generate_state(1)[0])
    history, _ = network_inputs(net, study.seasonality, training_seed, spec.training_days)
    planning = load_planning()
    planning.segmented = False
    settings = load_bullwhip()
    settings.lead_time_factor = float(case.factors["lead_factor"])
    result = simulate_network(
        net,
        usage,
        leads,
        warmup_days=spec.warmup_days,
        planning=planning,
        demand_history=history,
        bullwhip=settings,
    )
    series = echelon_series(net, result)
    weekly = {
        key: aggregate_periods(values, warmup_days=spec.warmup_days)
        for key, values in series.items()
    }
    count = len(weekly["customer_demand"])
    payload = ObservationSeries(
        label="Representative E4 replication · weekly units",
        source=f"docs/evidence/m7/E4/results.parquet · {case.case_id} · replication 0",
        seed=seed,
        days=[spec.warmup_days + 6 + i * 7 for i in range(count)],
        columns={name: finite(values) for name, values in weekly.items()},
    )
    ratio = float(
        bullwhip_ratio(series["dc_orders"], series["customer_demand"], warmup_days=spec.warmup_days)
    )
    return case.case_id, payload.model_dump(), ratio


def main() -> None:
    defaults = StudyDefaults.model_validate(
        yaml.safe_load(Path("configs/m10_views.yaml").read_text())
    )
    experiments: dict[str, Any] = {}
    inputs: set[Path] = (
        set(Path("engine/src/scm").rglob("*.py"))
        | set(Path("api").rglob("*.py"))
        | set(Path("configs").glob("*.yaml"))
    )
    for name in ("E2", "E3", "E4", "E6"):
        root = Path("docs/evidence/m7") / name
        manifest, summary = read(root / "manifest.json"), read(root / "summary.json")
        assert (
            hashlib.sha256((root / "results.parquet").read_bytes()).hexdigest()
            == manifest["parquet_sha256"]
        )
        for filename in ("summary.json", "summary.png"):
            assert (
                hashlib.sha256((root / filename).read_bytes()).hexdigest()
                == manifest["output_sha256"][filename]
            )
        inputs.update(
            root / filename for filename in ("manifest.json", "summary.json", "results.parquet")
        )
        experiments[name] = {
            "config_hash": manifest["config_hash"],
            "cases": manifest["cases"],
            "estimates": summary["estimates"],
            "paired_differences": summary["paired_differences"],
            "source": f"{root.as_posix()}/manifest.json",
        }
    cache = Path("data/m10_runs")
    with TestClient(create_app(run_root=cache)) as client:

        def run(count: int) -> dict[str, Any]:
            result = client.post(
                "/runs",
                json={
                    "seed": defaults.seed,
                    "replications": defaults.replications,
                    "overrides": {
                        "warmup_days": defaults.warmup_days,
                        "horizon_days": defaults.horizon_days,
                        "network": {"dc_count": count},
                    },
                },
            )
            assert result.status_code in {200, 202}, result.text
            status = client.get(f"/runs/{result.json()['run_id']}").json()
            assert status["status"] == "complete", status
            return dict(status)

        a, b = run(defaults.baseline_dcs), run(defaults.alternative_dcs)
        network_a = client.get(f"/runs/{a['run_id']}/network").json()
        network_b = client.get(f"/runs/{b['run_id']}/network").json()
        comparison = client.get("/compare", params={"a": a["run_id"], "b": b["run_id"]})
        assert comparison.status_code == 200, comparison.text
        pair = {
            "a": a,
            "b": b,
            "network_a": network_a,
            "network_b": network_b,
            "comparison": comparison.json(),
        }

    study = load_study()
    networks = {}
    for count in (1, 2, 4, 8):
        scenario = study.scenario.model_copy(deep=True)
        scenario.network.dc_count = count
        networks[str(count)] = (
            build_network(study.spec, scenario).as_contract(f"placement_{count}").model_dump()
        )

    benchmark = Benchmark.model_validate(
        yaml.safe_load(Path("configs/m2_validation.yaml").read_text())
    )
    q = eoq(benchmark.daily_mean * 365, benchmark.order_cost, benchmark.annual_holding_cost)
    usage, leads = samples(
        benchmark.seed,
        benchmark.warmup_days + benchmark.horizon_days,
        benchmark.replications,
        benchmark.daily_mean,
        benchmark.daily_std,
        benchmark.lead_mean,
        0,
    )
    result = simulate(
        usage[:, :1], leads[:, :1], policy(benchmark, q, benchmark.daily_mean * benchmark.lead_mean)
    )
    measured = slice(benchmark.warmup_days, benchmark.warmup_days + defaults.inventory_display_days)
    inventory = {
        "annual_demand": benchmark.daily_mean * 365,
        "order_cost": benchmark.order_cost,
        "holding_cost": benchmark.annual_holding_cost,
        "quantity": q,
        "series": ObservationSeries(
            label="M2 QR inventory · first seeded replication",
            source="configs/m2_validation.yaml",
            seed=int(
                np.random.SeedSequence(benchmark.seed)
                .spawn(benchmark.replications)[0]
                .generate_state(1)[0]
            ),
            days=list(range(defaults.inventory_display_days)),
            columns={
                "on_hand": finite(result.on_hand[measured, 0]),
                "ideal_sawtooth": finite(
                    q - (np.arange(defaults.inventory_display_days) * benchmark.daily_mean) % q
                ),
            },
        ).model_dump(),
    }

    e4_manifest = read("docs/evidence/m7/E4/manifest.json")
    spec = ExperimentSpec.model_validate(e4_manifest["settings"])
    e4_rows = pq.read_table("docs/evidence/m7/E4/results.parquet").to_pylist()
    reference = {
        row["case_id"]: row
        for row in e4_rows
        if row["replication"] == 0 and row["metric"] == "bwe_dc_orders"
    }
    with parallel_config(backend="loky", inner_max_num_threads=1):
        traces = Parallel(n_jobs=4)(
            delayed(bullwhip_trace)(
                Case.model_validate(case), spec, reference[case["case_id"]]["seed"]
            )
            for case in e4_manifest["cases"]
        )
    for case_id, _, ratio in traces:
        assert np.isclose(ratio, reference[case_id]["value"], rtol=1e-8), case_id
    bullwhip = {case_id: trace for case_id, trace, _ in traces}

    m6 = load_validation(Path("configs/m6_validation.yaml"))
    m6_results = read("docs/evidence/m6/results.json")
    seed = m6_results["network"][0]["seed"]
    net = build_network(study.spec, study.scenario)
    usage, leads = network_inputs(
        net, study.seasonality, seed, study.scenario.warmup_days + study.scenario.horizon_days
    )
    baseline = simulate_network(net, usage, leads, warmup_days=study.scenario.warmup_days)
    resilience = {}
    for i, event in enumerate(m6.events):
        scenario = study.scenario.model_copy(deep=True)
        scenario.disruptions = [event]
        event_net = build_network(study.spec, scenario)
        disturbed = simulate_network(event_net, usage, leads, warmup_days=scenario.warmup_days)
        metrics = paired_resilience(
            event_net,
            disturbed,
            baseline,
            event,
            window=m6.recovery_window,
            tolerance=m6.service_tolerance,
        )
        expected = next(
            row["metrics"]
            for row in m6_results["network"]
            if row["seed"] == seed and row["event"] == event.model_dump()
        )
        for name, value in metrics.items():
            assert value == expected[name] or (
                value is not None
                and expected[name] is not None
                and np.isclose(value, expected[name])
            ), name
        affected = affected_customers(event_net, event.target)

        def fill(run: Any) -> list[float | None]:
            return finite(
                rolling_fill(
                    run.demand[:, affected].sum(axis=1),
                    run.immediate[:, :, event_net.customer_indices][:, affected].sum(axis=1),
                    m6.recovery_window,
                )
            )

        resilience[str(i)] = {
            "event": event.model_dump(),
            "metrics": metrics,
            "series": ObservationSeries(
                label="Affected-customer rolling fill · representative M6 pair",
                source="docs/evidence/m6/manifest.json",
                seed=seed,
                days=list(range(len(usage))),
                columns={"baseline_fill": fill(baseline), "event_fill": fill(disturbed)},
            ).model_dump(),
        }
    theory_rows = read("docs/evidence/m5/results.json")["theory"]
    theory = ObservationSeries(
        label="M5 daily MA benchmark; separate from weekly network ratios",
        source="docs/evidence/m5/manifest.json",
        days=[row["window"] for row in theory_rows],
        columns={
            name: [row[name] for row in theory_rows]
            for name in ("bound", "observed_ratio", "control_ratio")
        },
    )
    m2 = read("docs/evidence/m2/results.json")
    validation = [
        {
            "parameter": name,
            "value": "PASS" if check["passed"] else "FAIL",
            "source": f"docs/evidence/m2/results.json · {json.dumps(check, sort_keys=True)}",
        }
        for name, check in m2["checks"].items()
    ]
    parameters = [
        {
            "parameter": key,
            "value": str(value),
            "source": "ASSUMPTION · configs/m10_views.yaml; docs/parameters.md",
        }
        for key, value in defaults.model_dump().items()
        if key != "events"
    ] + [
        {
            "parameter": "Customer annual holding rate",
            "value": str(study.spec.inventory.customer_holding_rate),
            "source": "ASSUMPTION · configs/network.yaml; docs/parameters.md",
        },
        {
            "parameter": "Customer ordering cost (INR/order)",
            "value": str(study.spec.inventory.customer_order_cost),
            "source": "ASSUMPTION · configs/network.yaml; docs/parameters.md",
        },
    ]
    evidence = StudyEvidence.model_validate(
        dict(
            defaults=defaults.model_dump(),
            experiments=experiments,
            pair=pair,
            networks=networks,
            inventory=inventory,
            bullwhip_series=bullwhip,
            resilience_series=resilience,
            theory=theory.model_dump(),
            parameters=parameters,
            validation=validation,
        )
    )
    path = Path("web/public/fixtures/studies.json")
    path.write_text(
        evidence.model_dump_json(exclude_none=False) + "\n", encoding="utf-8", newline="\n"
    )
    for name in ("m2", "m5", "m6"):
        inputs.update(
            Path(f"docs/evidence/{name}") / filename
            for filename in ("manifest.json", "results.json")
        )
    inputs.update({Path("contracts/study_evidence.schema.json"), Path("requirements-dev.lock")})
    folder = Path("docs/evidence/m10")
    folder.mkdir(exist_ok=True)
    manifest = {
        "command": "python -m scm.study_views",
        "checks": {"e4_representative_ratios_match": True, "m6_paired_metrics_match": True},
        "input_sha256": {
            p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(inputs)
        },
        "output_sha256": {path.as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()},
        "pair_run_ids": [a["run_id"], b["run_id"]],
        "bullwhip_cases": len(bullwhip),
        "resilience_events": len(resilience),
    }
    (folder / "fixture_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(
        f"Exported M10 evidence: {len(bullwhip)} E4 cases and {len(resilience)} event trajectories"
    )


if __name__ == "__main__":
    main()
