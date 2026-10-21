import hashlib
import json
from itertools import product
from pathlib import Path
from typing import Annotated, Literal, Self

import yaml
from pydantic import Field, model_validator

from scm.config.mitigation import MitigationSettings
from scm.config.models import Positive, PositiveInt
from scm.contracts import Contract, Fraction

Scalar = str | int | float | bool


class ServiceGrid(Contract):
    targets: list[Annotated[float, Field(gt=0, lt=1)]] = Field(min_length=1)
    skus: list[str] = Field(min_length=1)


class NetworkGrid(Contract):
    dc_counts: list[Literal[1, 2, 4, 8]] = Field(min_length=1)
    demand_cvs: list[Positive] = Field(min_length=1)
    correlations: list[Fraction] = Field(min_length=1)
    outbound_factors: list[Positive] = Field(min_length=1)
    inbound_days: list[Positive] = Field(min_length=1)
    screen_replications: PositiveInt
    confirm_replications: PositiveInt
    break_even_fraction: Fraction


class BullwhipGrid(Contract):
    sharing: list[bool] = Field(min_length=1)
    lead_factors: list[Annotated[float, Field(gt=0, le=1)]] = Field(min_length=1)


class SegmentationGrid(Contract):
    calibration_replications: PositiveInt
    offsets: list[float] = Field(min_length=1)
    service_tolerance: Fraction


class ResilienceGrid(Contract):
    events_config: str
    sensitivities: list[Literal["demand", "capacity", "lead", "holding"]]
    sensitivity_factors: list[Positive]
    mitigations: dict[str, MitigationSettings] = Field(min_length=1)


class ExperimentSpec(Contract):
    seed: Annotated[int, Field(ge=0)]
    replications: PositiveInt
    workers: PositiveInt
    warmup_days: Annotated[int, Field(ge=0)]
    horizon_days: Annotated[int, Field(ge=14)]
    training_days: Annotated[int, Field(ge=2)]
    e2: ServiceGrid
    e3: NetworkGrid
    e4: BullwhipGrid
    e5: SegmentationGrid
    e6: ResilienceGrid

    @model_validator(mode="after")
    def unique_axes(self) -> Self:
        for section in (self.e2, self.e3, self.e4, self.e5, self.e6):
            for values in section.model_dump().values():
                if isinstance(values, list) and len(values) != len(set(values)):
                    raise ValueError("duplicate experiment factor values")
        if "none" not in self.e6.mitigations:
            raise ValueError("E6 requires a none mitigation reference")
        if self.e6.mitigations["none"] != MitigationSettings():
            raise ValueError("the none mitigation reference must disable all mitigations")
        return self


class Case(Contract):
    case_id: str
    factors: dict[str, Scalar]


def case(experiment: str, **factors: Scalar) -> Case:
    digest = hashlib.sha256(json.dumps(factors, sort_keys=True).encode()).hexdigest()[:16]
    return Case(case_id=f"{experiment}_{digest}", factors=factors)


def load_spec(path: Path = Path("configs/experiments.yaml")) -> ExperimentSpec:
    return ExperimentSpec.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def expand_grid(spec: ExperimentSpec, experiment: str) -> list[Case]:
    axes: dict[str, list[Scalar]]
    if experiment == "E2":
        axes = {"sku": list(spec.e2.skus), "target_csl": list(spec.e2.targets)}
    elif experiment == "E3":
        g = spec.e3
        axes = {
            "dc_count": list(g.dc_counts),
            "demand_cv": list(g.demand_cvs),
            "rho": list(g.correlations),
            "outbound_factor": list(g.outbound_factors),
            "inbound_days": list(g.inbound_days),
        }
    elif experiment == "E4":
        axes = {
            name: [False, True] for name in ("signal_processing", "batching", "price", "rationing")
        }
        axes.update(pos_sharing=list(spec.e4.sharing), lead_factor=list(spec.e4.lead_factors))
    elif experiment == "E5":
        return [
            case(experiment, segmented=False, offset=0.0),
            case(experiment, segmented=True, offset=0.0),
        ]
    elif experiment == "E6":
        from scm.experiments.e6_validate import load_validation

        events = load_validation(Path(spec.e6.events_config)).events
        sensitivity = [("none", 1.0)] + list(
            product(spec.e6.sensitivities, spec.e6.sensitivity_factors)
        )
        return [
            case(experiment, event=i, mitigation=m, parameter=p, scale=s)
            for i, m, (p, s) in product(range(len(events)), spec.e6.mitigations, sensitivity)
        ]
    elif experiment == "E1":
        return [case(experiment, validation="V1-V4")]
    else:
        raise ValueError("experiment must be E1 through E6")
    rows = [case(experiment, **dict(zip(axes, values))) for values in product(*axes.values())]
    if len({row.case_id for row in rows}) != len(rows):
        raise ValueError("duplicate experiment factor values")
    return rows
