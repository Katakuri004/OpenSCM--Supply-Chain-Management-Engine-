from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi import HTTPException
from scm.config.api import load_api_settings
from scm.config.loader import load_study
from scm.contracts import RunRequest
from scm.metrics.kpis import replication_kpis
from scm.network.builder import build_network
from scm.openapi import export_openapi
from scm.sim.multi_echelon import simulate_network

from api.app.service import RunStore, Sample


def test_duplicate_queue_restart_failure_and_retry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = load_api_settings()
    settings.max_pending_runs = 1
    repository = RunStore(tmp_path, settings)
    request = RunRequest.model_validate(
        {"seed": 1, "overrides": {"warmup_days": 0, "horizon_days": 4}}
    )
    status, created = repository.reserve(request)
    assert created
    assert not repository.reserve(request)[1]
    with pytest.raises(HTTPException) as error:
        repository.reserve(request.model_copy(update={"seed": 2}))
    assert error.value.status_code == 503
    restarted = RunStore(tmp_path, settings)
    assert restarted.status(status.run_id).status == "failed"
    status, created = restarted.reserve(request)
    assert created

    def fail(*_args: Any, **_kwargs: Any) -> Sample:
        raise RuntimeError("controlled failure")

    with monkeypatch.context() as patch:
        patch.setattr("api.app.service.sample_run", fail)
        restarted.compute(status.run_id)
    assert restarted.status(status.run_id).status == "failed"
    assert not restarted.pending
    status, created = restarted.reserve(request)
    assert created
    restarted.compute(status.run_id)
    assert restarted.status(status.run_id).status == "complete"


def test_source_service_excludes_late_fifo_dispatch_and_kpis_use_nulls() -> None:
    study = load_study()
    study.scenario.policy.default = "order_up_to"
    net = build_network(study.spec, study.scenario)
    net.initial_stock[:] = 0
    net.upper[:] = 10
    net.upper[:, net.is_dc] = 10000
    net.reorder[:] = 0
    net.pack[:] = net.moq[:] = 1
    net.capacity[:] = 1e8
    demand = np.zeros((6, 20, 28))
    demand[0, 0, 0] = 1
    leads = np.ones((6, len(net.source)), dtype=np.int64)
    result = simulate_network(net, demand, leads, log_source_service=True)
    dc = net.parent[0, net.customer_indices[0]]
    assert result.source_immediate is not None
    assert result.dispatched[1, 0, dc] > 0
    assert result.source_immediate[1, 0, dc] == 0
    metrics, costs, _ = replication_kpis(net, result, load_api_settings())
    assert metrics["fill_rate"][-1] == 0
    assert np.isnan(metrics["inventory_turns"][0])
    assert costs.sum() == pytest.approx(result.measured_cost.sum())


def test_openapi_drift_check_is_read_only(tmp_path: Path) -> None:
    path = tmp_path / "openapi.json"
    export_openapi(path)
    export_openapi(path, check=True)
    path.write_text("{}")
    with pytest.raises(SystemExit, match="Stale OpenAPI"):
        export_openapi(path, check=True)
    assert path.read_text() == "{}"
