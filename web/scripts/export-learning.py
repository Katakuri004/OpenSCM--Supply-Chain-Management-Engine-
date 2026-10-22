"""Export the teaching catalog; engine contracts validate every paired request."""

import argparse
import json
from pathlib import Path

import yaml
from scm.contracts import RunRequest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
catalog = yaml.safe_load((root / "configs/learning.yaml").read_text(encoding="utf-8"))
for lesson in catalog["lessons"]:
    for key in ("request_a", "request_b"):
        RunRequest.model_validate(lesson[key])
target = root / "web/src/fixtures/learning.json"
if args.check:
    assert json.loads(target.read_text(encoding="utf-8")) == catalog, "Regenerate learning catalog"
else:
    target.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8", newline="\n")
