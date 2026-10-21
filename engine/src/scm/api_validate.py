"""Reproduce M8 API acceptance through real ASGI requests and persist response evidence."""

import argparse
import hashlib
import json
import platform
from importlib.metadata import version
from pathlib import Path
from typing import Annotated, Literal

import yaml
from fastapi.testclient import TestClient
from pydantic import Field

from api.app.main import create_app
from scm.config.models import PositiveInt
from scm.contracts import Contract, ExperimentName, Identifier


class ValidationSettings(Contract):
    seed: Annotated[int, Field(ge=0)]
    replications: Annotated[int, Field(ge=2)]
    warmup_days: Annotated[int, Field(ge=0)]
    horizon_days: PositiveInt
    alternative_dc_count: Literal[1, 2, 4, 8]
    node: Identifier
    sku: Identifier
    query: str
    experiment: ExperimentName
    experiment_limit: PositiveInt


def validate(output: Path, cache: Path, config: Path) -> dict[str, object]:
    settings = ValidationSettings.model_validate(yaml.safe_load(config.read_text()))
    output.mkdir(parents=True, exist_ok=True)
    checks: dict[str, bool] = {}
    with TestClient(create_app(run_root=cache)) as client:
        overrides = {"warmup_days": settings.warmup_days, "horizon_days": settings.horizon_days}
        body = {
            "preset": "base_4dc",
            "seed": settings.seed,
            "replications": settings.replications,
            "overrides": overrides,
        }
        a = client.post("/runs", json=body)
        assert a.status_code in {200, 202}, a.text
        run_a = a.json()["run_id"]
        checks["background_completed"] = client.get(f"/runs/{run_a}").json()["status"] == "complete"
        checks["cache_hit"] = client.post("/runs", json=body).status_code == 200
        alternative = body | {
            "overrides": overrides | {"network": {"dc_count": settings.alternative_dc_count}}
        }
        b = client.post("/runs", json=alternative)
        assert b.status_code in {200, 202}, b.text
        run_b = b.json()["run_id"]
        checks["different_network_changes_id"] = run_a != run_b
        urls = {
            "network": f"/runs/{run_a}/network",
            "health": f"/runs/{run_a}/health",
            "kpis": f"/runs/{run_a}/kpis",
            "timeseries": f"/runs/{run_a}/timeseries",
        }
        responses = {}
        for name, url in urls.items():
            response = client.get(
                url,
                params={"node": settings.node, "sku": settings.sku}
                if name == "timeseries"
                else None,
            )
            assert response.status_code == 200, response.text
            responses[name] = response.json()
        query = client.post(f"/runs/{run_a}/query", json={"text": settings.query})
        assert query.status_code == 200, query.text
        responses["query"] = query.json()
        same = client.post(f"/runs/{run_a}/query", json={"filter": query.json()["filter"]})
        checks["text_equals_structured_filter"] = same.json() == query.json()
        checks["injection_rejected"] = (
            client.post(
                f"/runs/{run_a}/query", json={"text": "nodes with on hand < 1; DROP TABLE nodes"}
            ).status_code
            == 422
        )
        comparison = client.get("/compare", params={"a": run_a, "b": run_b})
        assert comparison.status_code == 200, comparison.text
        responses["comparison"] = comparison.json()
        checks["cost_stack_aligned"] = len(comparison.json()["costs"]["component"]) == 8
        experiment = client.get(
            f"/experiments/{settings.experiment}", params={"limit": settings.experiment_limit}
        )
        assert experiment.status_code == 200, experiment.text
        responses["experiment"] = experiment.json()
        checks["experiment_page_aligned"] = (
            len(experiment.json()["value"]) == settings.experiment_limit
        )
        for name, data in responses.items():
            (output / f"{name}.json").write_text(
                json.dumps(data, indent=2, allow_nan=False) + "\n", encoding="utf-8"
            )
    results = {
        "milestone": "M8",
        "passed": all(checks.values()),
        "checks": checks,
        "run_a": run_a,
        "run_b": run_b,
        "health_nodes": len(responses["health"]["node_ids"]),
        "health_days": len(responses["health"]["days"]),
        "query_matches": len(responses["query"]["node_ids"]),
        "replications": settings.replications,
    }
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    paths = sorted(
        set(Path("engine/src/scm").rglob("*.py"))
        | set(Path("api").rglob("*.py"))
        | set(Path("configs").glob("*.yaml"))
        | set(Path("contracts").glob("*.schema.json"))
        | {
            Path("contracts/openapi.json"),
            Path("web/src/lib/api/schema.ts"),
            Path("web/src/lib/api/client.ts"),
            Path("web/scripts/generate-client.mjs"),
            Path("web/package-lock.json"),
            Path("requirements-dev.lock"),
            Path("pyproject.toml"),
        }
    )
    manifest = {
        "command": "python -m scm.api_validate",
        "python": platform.python_version(),
        "versions": {
            p: version(p)
            for p in (
                "fastapi",
                "starlette",
                "uvicorn",
                "duckdb",
                "httpx",
                "numpy",
                "scipy",
                "pydantic",
                "pyarrow",
            )
        },
        "validation_settings": settings.model_dump(),
        "input_sha256": {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
        "output_sha256": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in output.glob("*.json")
            if p.name != "manifest.json"
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/evidence/m8"))
    parser.add_argument("--cache", type=Path, default=Path("data/m8_validation/runs"))
    parser.add_argument("--config", type=Path, default=Path("configs/m8_validation.yaml"))
    args = parser.parse_args()
    result = validate(args.output, args.cache, args.config)
    print(json.dumps(result, indent=2))
    if not result["passed"]:
        raise SystemExit("M8 API validation failed")


if __name__ == "__main__":
    main()
