from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from scm.contracts import Contract, Fraction, Identifier, Nonnegative

Positive = Annotated[float, Field(gt=0)]
PositiveInt = Annotated[int, Field(gt=0)]


class Site(Contract):
    id: Identifier
    label: str
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]


class Supplier(Site):
    price_multiplier: Positive
    lead_mean: Positive
    lead_cv: Nonnegative
    moq: PositiveInt
    daily_capacity: Nonnegative
    delay_probability: Fraction
    delay_days: Annotated[int, Field(ge=0)]


class DC(Site):
    daily_capacity: Nonnegative
    annual_fixed_cost: Nonnegative
    holding_rate: Positive
    handling_cost: Nonnegative


class Customer(Site):
    kind: Literal["retailer", "b2b"]
    region: Annotated[int, Field(ge=0)]
    demand_scale: Positive
    arrival_probability: Fraction
    target_csl: Annotated[float, Field(gt=0, lt=1)]
    shortage_penalty: Nonnegative

    @model_validator(mode="after")
    def retailer_arrivals(self) -> Self:
        if self.kind == "retailer" and self.arrival_probability != 1:
            raise ValueError("retailer arrival_probability must be 1")
        return self


class SKU(Contract):
    id: Identifier
    label: str
    unit_cost: Positive
    daily_mean: Nonnegative
    cv: Nonnegative
    pack_size: PositiveInt
    moq: PositiveInt
    supplier: Identifier
    value_class: Literal["A", "B", "C"]
    demand_kind: Literal["normal", "gamma"]


class Transport(Contract):
    circuity: Annotated[float, Field(ge=1)]
    km_per_day: Positive
    outbound_handling_days: Nonnegative
    outbound_lead_cv: Nonnegative
    ltl_per_unit_km: Nonnegative
    ftl_capacity: Positive
    ftl_fixed_cost: Nonnegative
    ftl_per_km: Nonnegative


class Inventory(Contract):
    dc_order_cost: Positive
    customer_order_cost: Positive
    customer_holding_rate: Positive
    review_days: PositiveInt
    initial_stock_fraction: Nonnegative


class NetworkSpec(Contract):
    suppliers: list[Supplier] = Field(min_length=1)
    dcs: list[DC] = Field(min_length=1)
    customers: list[Customer] = Field(min_length=1)
    skus: list[SKU] = Field(min_length=1)
    transport: Transport
    inventory: Inventory

    @model_validator(mode="after")
    def references(self) -> Self:
        sites = [*self.suppliers, *self.dcs, *self.customers]
        if len({site.id for site in sites}) != len(sites):
            raise ValueError("node IDs must be globally unique")
        if len({sku.id for sku in self.skus}) != len(self.skus):
            raise ValueError("SKU IDs must be unique")
        if not {sku.supplier for sku in self.skus}.issubset(s.id for s in self.suppliers):
            raise ValueError("SKU references an unknown supplier")
        if any(node.region >= len(self.customers) for node in self.customers):
            raise ValueError("region index must be less than the customer count")
        return self


class Seasonality(Contract):
    monthly_index_v1: list[Nonnegative] = Field(min_length=12, max_length=12)
