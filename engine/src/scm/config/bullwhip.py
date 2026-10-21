from pathlib import Path
from typing import Annotated, Self

import yaml
from pydantic import Field, model_validator

from scm.config.models import PositiveInt
from scm.contracts import Contract, Fraction, Nonnegative


class BullwhipSettings(Contract):
    batch_days: PositiveInt
    batch_multiple: PositiveInt
    promo_period: PositiveInt
    promo_days: PositiveInt
    promo_start: Annotated[int, Field(ge=0)]
    discount_fraction: Annotated[float, Field(ge=0, lt=1)]
    forward_buy_days: Nonnegative
    rationing_threshold: Fraction
    rationing_gain: Nonnegative
    smoothing_alpha: Annotated[float, Field(gt=0, le=1)]
    lead_time_factor: Annotated[float, Field(gt=0, le=1)]
    vmi: bool
    edlp: bool

    @model_validator(mode="after")
    def calendar(self) -> Self:
        if self.promo_days > self.promo_period:
            raise ValueError("promo_days cannot exceed promo_period")
        return self

    def promotion(self, day: int) -> bool:
        return (
            not self.edlp
            and day >= self.promo_start
            and (day - self.promo_start) % self.promo_period < self.promo_days
        )


def load_bullwhip(path: Path = Path("configs/bullwhip.yaml")) -> BullwhipSettings:
    return BullwhipSettings.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
