from pathlib import Path

import yaml

from scm.config.models import PositiveInt
from scm.contracts import Contract, Nonnegative


class ApiSettings(Contract):
    max_replications: PositiveInt
    max_horizon_days: PositiveInt
    max_warmup_days: PositiveInt
    max_pending_runs: PositiveInt
    workers: PositiveInt
    training_days: PositiveInt
    days_sales_outstanding: Nonnegative
    days_payables_outstanding: Nonnegative
    experiment_page_size: PositiveInt
    experiment_page_limit: PositiveInt
    cors_origins: list[str]


def load_api_settings() -> ApiSettings:
    return ApiSettings.model_validate(yaml.safe_load(Path("configs/api.yaml").read_text()))
