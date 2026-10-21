from pathlib import Path

from scm.sim.validate import run_validation


def test_m2_acceptance(tmp_path: Path) -> None:
    result = run_validation(Path("configs/m2_validation.yaml"), tmp_path, plots=False)
    for name, check in result["checks"].items():
        assert check["passed"], f"{name}: {check}"
    assert (tmp_path / "manifest.json").is_file()
    assert (tmp_path / "results.json").is_file()
