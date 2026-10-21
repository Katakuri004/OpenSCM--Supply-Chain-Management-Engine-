from typing import Annotated

from pydantic import Field

from scm.contracts import Contract, Identifier, Nonnegative


class MitigationSettings(Contract):
    buffer_days: Nonnegative = 0
    expedite_factor: Annotated[float, Field(gt=0, le=1)] = 1
    expedite_unit_cost: Nonnegative = 0
    backup_suppliers: dict[Identifier, Identifier] = Field(default_factory=dict)
