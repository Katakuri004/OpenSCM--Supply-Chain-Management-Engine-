"""Export a recorded SKU inspector and node observations for the M9 Control Tower."""

import hashlib
import json
from pathlib import Path

import pyarrow.parquet as pq
import yaml
from fastapi.testclient import TestClient

from api.app.main import create_app


def main() -> None:
    settings = yaml.safe_load(Path("configs/m8_validation.yaml").read_text())
    cache = Path("data/m9_fixture_runs")
    request = {
        "seed": settings["seed"],
        "replications": settings["replications"],
        "overrides": {
            "warmup_days": settings["warmup_days"],
            "horizon_days": settings["horizon_days"],
        },
    }
    with TestClient(create_app(run_root=cache)) as client:
        response = client.post("/runs", json=request)
        assert response.status_code in {200, 202}, response.text
        status = client.get(f"/runs/{response.json()['run_id']}").json()
        assert status["status"] == "complete", status
        run_id = status["run_id"]

        def get(endpoint: str, **params: str) -> object:
            result = client.get(f"/runs/{run_id}/{endpoint}", params=params)
            assert result.status_code == 200, result.text
            return result.json()

        network = client.get(f"/runs/{run_id}/network").json()
        table = pq.read_table(cache / run_id / "nodes.parquet").to_pydict()
        payload = {
            "status": status,
            "request": request,
            "catalog": client.get("/scenarios").json(),
            "network": network,
            "health": get("health"),
            "sku": settings["sku"],
            "series": {
                node: get("timeseries", node=node, sku=settings["sku"], start_day="0")
                for node in network["network"]["nodes"]["id"]
            },
            "kpis": {node: get("kpis", node=node) for node in network["network"]["nodes"]["id"]},
            "observations": table,
        }
    path = Path("web/public/fixtures/tower.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8"
    )
    defaults = Path("web/src/fixtures/request.json")
    defaults.parent.mkdir(parents=True, exist_ok=True)
    defaults.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
    output = Path("docs/evidence/m9")
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((cache / run_id / "manifest.json").read_text())
    manifest["command"] = "python -m scm.web_fixtures"
    manifest["fixture_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest["fixture_path"] = path.as_posix()
    manifest["request_defaults_sha256"] = hashlib.sha256(defaults.read_bytes()).hexdigest()
    (output / "fixture_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Exported {len(network['network']['nodes']['id'])} nodes; "
        f"recorded inspector SKU {settings['sku']}"
    )


if __name__ == "__main__":
    main()
