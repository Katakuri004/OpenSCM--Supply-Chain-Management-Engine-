"""Apply validated operating assumptions to a fresh study snapshot."""

from scm.config.loader import Study
from scm.config.models import NetworkSpec, Seasonality
from scm.config.planning import ForecastSettings, PlanningSettings
from scm.contracts import LabSettings


def configure_study(study: Study, lab: LabSettings) -> Study:
    data = study.spec.model_dump()
    supplier_ids = {row.id for row in study.spec.suppliers}
    if not set(lab.suppliers).issubset(supplier_ids):
        raise ValueError("unknown supplier assumption target")
    if not set(lab.skus).issubset(row.id for row in study.spec.skus):
        raise ValueError("unknown SKU assumption target")
    for row in data["suppliers"]:
        if row["id"] in lab.suppliers:
            row.update(lab.suppliers[row["id"]].model_dump(exclude_none=True))
    for row in data["skus"]:
        if row["id"] in lab.skus:
            row.update(lab.skus[row["id"]].model_dump(exclude_none=True))
    for row in data["dcs"]:
        row["daily_capacity"] *= lab.dc_capacity_factor
    selected = set(study.scenario.network.suppliers)
    if not set(lab.backup_suppliers).union(lab.backup_suppliers.values()).issubset(selected):
        raise ValueError("backup suppliers must be selected suppliers")
    return Study(
        study.scenario.model_copy(deep=True),
        NetworkSpec.model_validate(data),
        Seasonality(monthly_index_v1=lab.monthly_index or study.seasonality.monthly_index_v1),
    )


def configure_planning(settings: PlanningSettings, lab: LabSettings) -> PlanningSettings:
    result = settings.model_copy(deep=True)
    changes = {
        key.removeprefix("forecast_"): value
        for key, value in lab.model_dump(exclude_none=True).items()
        if key.startswith("forecast_")
    }
    result.forecast = ForecastSettings.model_validate(settings.forecast.model_dump() | changes)
    return result
