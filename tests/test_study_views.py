import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from scm.contracts import ObservationSeries, StudyEvidence, StudyPair

from api.app.main import create_app


def test_recorded_study_views_are_typed_and_seed_aligned() -> None:
    data = StudyEvidence.model_validate_json(
        Path("web/public/fixtures/studies.json").read_text(encoding="utf-8")
    )
    assert set(data.experiments) == {"E2", "E3", "E4", "E6"}
    assert len(data.experiments["E3"].cases) == 432
    assert len(data.bullwhip_series) == 64
    assert len(data.resilience_series) == 6
    assert data.pair.a.seed == data.pair.b.seed
    assert data.pair.comparison.run_a == data.pair.a.run_id
    assert data.pair.comparison.run_b == data.pair.b.run_id
    assert data.inventory.quantity == 100


def test_study_api_matches_the_recorded_fixture() -> None:
    with TestClient(create_app()) as client:
        result = client.get("/studies")
    assert result.status_code == 200
    assert result.json() == json.loads(
        Path("web/public/fixtures/studies.json").read_text(encoding="utf-8")
    )


def test_observation_columns_must_align_with_days() -> None:
    with pytest.raises(ValidationError, match="column lengths"):
        ObservationSeries(label="Stock", source="test", days=[90, 91], columns={"stock": [1]})


@pytest.mark.parametrize("field", ["seed", "replications"])
def test_study_pair_rejects_unpaired_runs(field: str) -> None:
    pair = json.loads(Path("contracts/fixtures/study_evidence.json").read_text(encoding="utf-8"))[
        "pair"
    ]
    pair["b"][field] += 1
    with pytest.raises(ValidationError, match="matching seeds and replication counts"):
        StudyPair.model_validate(pair)
