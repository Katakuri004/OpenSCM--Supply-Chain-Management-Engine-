from dataclasses import dataclass
from pathlib import Path

import yaml

from scm.contracts import Scenario

from .models import NetworkSpec, Seasonality


@dataclass(frozen=True)
class Study:
    scenario: Scenario
    spec: NetworkSpec
    seasonality: Seasonality


def load_study(
    scenario_path: Path = Path("configs/base_4dc.yaml"),
    network_path: Path = Path("configs/network.yaml"),
    seasonality_path: Path = Path("configs/demand.yaml"),
) -> Study:
    scenario = Scenario.model_validate(yaml.safe_load(scenario_path.read_text(encoding="utf-8")))
    spec = NetworkSpec.model_validate(yaml.safe_load(network_path.read_text(encoding="utf-8")))
    seasonality = Seasonality.model_validate(
        yaml.safe_load(seasonality_path.read_text(encoding="utf-8"))
    )
    if not set(scenario.network.suppliers).issubset(s.id for s in spec.suppliers):
        raise ValueError("scenario selects an unknown supplier")
    if not {s.supplier for s in spec.skus}.issubset(scenario.network.suppliers):
        raise ValueError("every SKU primary supplier must be selected")
    if scenario.network.dc_count > len(spec.dcs):
        raise ValueError("not enough DC candidates")
    return Study(scenario, spec, seasonality)
