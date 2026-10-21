import json
from pathlib import Path

import yaml
from scm.config.loader import load_study
from scm.experiments.e5_dry_run import run_dry_run


def test_e5_pipeline_uses_disjoint_training_calibration_and_evaluation_seeds(
    tmp_path: Path,
) -> None:
    scenario = load_study().scenario.model_dump()
    scenario.update(horizon_days=7, warmup_days=3)
    scenario_path = tmp_path / "scenario.yaml"
    scenario_path.write_text(yaml.safe_dump(scenario))
    config_path = tmp_path / "validation.yaml"
    config_path.write_text(
        yaml.safe_dump(
            dict(
                seed=404,
                training_days=20,
                calibration_replications=1,
                evaluation_replications=1,
                segmented_safety_offsets=[0.0],
                service_tolerance=0.99,
            )
        )
    )
    output = tmp_path / "evidence"
    results = run_dry_run(output, config_path=config_path, scenario_path=scenario_path)
    assert results["passed"] is True
    saved = json.loads((output / "results.json").read_text())
    seeds = saved["seeds"]
    assert len({seeds["training"], *seeds["calibration"], *seeds["evaluation"]}) == 3
    assert len(saved["segments"]["cell"]) == 20
    assert saved["selected_safety_offset"] == 0
    assert saved["evaluation"]["uniform"][0]["seed"] == seeds["evaluation"][0]
    assert saved["evaluation"]["segmented"][0]["seed"] == seeds["evaluation"][0]
    assert (output / "manifest.json").exists()
