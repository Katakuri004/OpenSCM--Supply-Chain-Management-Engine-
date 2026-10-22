"""Generate the browser playbook catalog from the canonical YAML configuration."""

import argparse
import json
from pathlib import Path

import yaml
from scm.contracts import RunRequest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
catalog = yaml.safe_load((root / "configs/workspace.yaml").read_text(encoding="utf-8"))
for playbook in catalog["playbooks"]:
    RunRequest.model_validate(playbook["request"])
target = root / "web/src/fixtures/workspace.json"
if args.check:
    assert json.loads(target.read_text(encoding="utf-8")) == catalog, (
        "Regenerate the workspace catalog"
    )
else:
    target.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8", newline="\n")
