from pathlib import Path
from typing import Annotated, Literal, Self

import yaml
from pydantic import Field, model_validator

from scm.config.models import Positive, PositiveInt
from scm.contracts import Contract, Fraction

PolicyKind = Literal["QR", "sS", "RS", "order_up_to"]
ServiceTarget = Annotated[float, Field(gt=0, lt=1)]


class ForecastSettings(Contract):
    method: Literal["moving_average", "ses", "holt"]
    window: PositiveInt
    alpha: Annotated[float, Field(gt=0, le=1)]
    beta: Fraction


class SegmentPolicy(Contract):
    policy: PolicyKind
    target_csl: ServiceTarget


class SegmentationSettings(Contract):
    abc_a: ServiceTarget
    abc_b: ServiceTarget
    xyz_x: Positive
    xyz_y: Positive
    cells: dict[str, SegmentPolicy]

    @model_validator(mode="after")
    def complete_map(self) -> Self:
        if self.abc_a >= self.abc_b or self.xyz_x >= self.xyz_y:
            raise ValueError("ABC and XYZ thresholds must increase")
        if set(self.cells) != {a + x for a in "ABC" for x in "XYZ"}:
            raise ValueError("policy map must contain exactly AX through CZ")
        return self


class PlanningSettings(Contract):
    forecast: ForecastSettings
    segmentation: SegmentationSettings
    segmented: bool
    safety_factor_offset: float


def load_planning(path: Path = Path("configs/planning.yaml")) -> PlanningSettings:
    return PlanningSettings.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
