"""Export the reference builder input and public contract fixtures; no simulation runs."""

import argparse
import json
from pathlib import Path

from fastapi.testclient import TestClient

from api.app.main import create_app

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
client = TestClient(create_app())
catalog = client.get("/models/catalog").json()
preview = client.post("/models/preview", json=catalog["request"]).json()
paths = {
    "web/src/fixtures/builder.json": catalog,
    "contracts/fixtures/builder_catalog.json": catalog,
    "contracts/fixtures/model_snapshot.json": catalog["request"]["model"],
    "contracts/fixtures/network_spec.json": catalog["request"]["model"]["spec"],
    "contracts/fixtures/model_preview.json": preview,
}
for name, value in paths.items():
    target = Path(name)
    if args.check:
        assert json.loads(target.read_text(encoding="utf-8")) == value, name
    else:
        target.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")
