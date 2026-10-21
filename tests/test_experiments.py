from pathlib import Path

import numpy as np
import pytest
from scm.experiments.runner import expand_grid, load_spec, run_experiment
from scm.experiments.stats import estimate, paired_difference


def test_t_intervals_and_pairs_are_matched_by_seed() -> None:
    result = estimate([1.0, 2.0, 3.0])
    assert result["mean"] == 2
    assert result["low"] == pytest.approx(-0.4841377117)
    assert result["high"] == pytest.approx(4.4841377117)
    assert estimate([None])["mean"] is None
    assert estimate([1.0])["low"] is None
    paired = paired_difference({10: 1.0, 20: 2.0}, {20: 5.0, 10: 4.0})
    assert paired["mean"] == paired["low"] == paired["high"] == 3
    with pytest.raises(ValueError, match="seeds"):
        paired_difference({10: 1.0}, {20: 2.0})


def test_all_factorial_cells_and_stable_case_ids() -> None:
    spec = load_spec()
    assert len(expand_grid(spec, "E3")) == 432
    assert len(expand_grid(spec, "E4")) == 64
    cells = expand_grid(spec, "E4")
    assert len({c.case_id for c in cells}) == len(cells)
    assert cells == expand_grid(spec, "E4")


def test_serial_parallel_parquet_reproduction(tmp_path: Path) -> None:
    spec = load_spec()
    spec.replications = 2
    spec.horizon_days = 28
    spec.warmup_days = 14
    spec.e2.targets = [0.9]
    spec.e2.skus = ["SKU01"]
    first = run_experiment(spec, "E2", tmp_path / "serial", workers=1)
    second = run_experiment(spec, "E2", tmp_path / "parallel", workers=2)
    assert first["parquet_sha256"] == second["parquet_sha256"]
    assert (tmp_path / "serial/results.parquet").read_bytes() == (
        tmp_path / "parallel/results.parquet"
    ).read_bytes()
    assert first["config_hash"] == second["config_hash"]


def test_reject_nonfinite_statistics() -> None:
    with pytest.raises(ValueError):
        estimate([np.inf])


def test_confirmation_uses_near_break_even_blocks() -> None:
    from scm.contracts import ExperimentRow
    from scm.experiments.design import case
    from scm.experiments.runner import _confirm_cases

    spec = load_spec()
    cases = [case("E3", dc_count=k, rho=0.3) for k in [1, 2, 4]]
    rows = [
        ExperimentRow(
            experiment="E3",
            case_id=c.case_id,
            phase="screen",
            replication=0,
            seed=1,
            metric="landed_cost_inr",
            value=v,
        )
        for c, v in zip(cases, [100.0, 103.0, 120.0])
    ]
    assert _confirm_cases(spec, cases, rows) == cases[:2]


def test_network_freight_factor_and_inbound_targets() -> None:
    from scm.config.loader import load_study
    from scm.network.builder import build_network
    from scm.sim.multi_echelon import simulate_network

    study = load_study()
    short = build_network(study.spec, study.scenario, inbound_lead_days=3)
    long = build_network(study.spec, study.scenario, inbound_lead_days=14)
    assert np.all(long.reorder[:, long.is_dc] > short.reorder[:, short.is_dc])
    np.testing.assert_array_equal(short.lead_mean[short.is_supplier[short.source]], 3)
    short.initial_stock[:] = 0
    usage = np.ones((8, 20, 28))
    leads = np.ones((8, len(short.source)), dtype=np.int64)
    a = simulate_network(short, usage, leads)
    b = simulate_network(short, usage, leads, outbound_freight_factor=2)
    np.testing.assert_array_equal(a.orders, b.orders)
    np.testing.assert_array_equal(a.costs["inbound_freight"], b.costs["inbound_freight"])
    np.testing.assert_array_equal(a.costs["outbound_freight"] * 2, b.costs["outbound_freight"])
