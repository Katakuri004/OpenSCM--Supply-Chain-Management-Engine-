import json
from pathlib import Path

import yaml
from scm.config.api import load_api_settings
from scm.contracts import RunRequest

from api.app.service import RunStore


def test_operational_playbooks_match_yaml_and_validate_as_engine_requests(tmp_path: Path) -> None:
    catalog = yaml.safe_load(Path("configs/workspace.yaml").read_text(encoding="utf-8"))
    assert catalog == json.loads(
        Path("web/src/fixtures/workspace.json").read_text(encoding="utf-8")
    )
    assert len(catalog["playbooks"]) >= 8
    assert len({row["id"] for row in catalog["playbooks"]}) == len(catalog["playbooks"])
    for playbook in catalog["playbooks"]:
        request = RunRequest.model_validate(playbook["request"])
        assert request.overrides is not None
        assert request.overrides.disruptions is not None
        assert playbook["assumption"].startswith("ASSUMPTION")
        store = RunStore(tmp_path / playbook["id"], load_api_settings())
        status, created = store.reserve(request)
        assert created and status.status == "queued"
        assert status.replications == request.replications
