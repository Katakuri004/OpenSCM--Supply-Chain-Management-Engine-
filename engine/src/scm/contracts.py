"""M0 wire contracts. Generate JSON Schema with python -m scm.contracts."""

import argparse
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

Nonnegative = Annotated[float, Field(ge=0)]
Fraction = Annotated[float, Field(ge=0, le=1)]
Identifier = Annotated[str, Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")]
NodeType = Literal["supplier", "dc", "retailer", "b2b"]
Metric = Literal["days_of_cover", "fill_rate", "on_hand", "on_order", "backorders"]
SeriesMetric = Literal[
    "days_of_cover",
    "fill_rate",
    "on_hand",
    "on_order",
    "backorders",
    "demand",
    "immediate",
    "orders",
    "received",
    "forecast",
]
KpiMetric = Literal[
    "fill_rate",
    "cycle_service_level",
    "stockout_days",
    "inventory_turns",
    "days_of_inventory",
    "cash_to_cash_days",
    "otif",
    "total_landed_cost_inr",
    "bullwhip_ratio",
]
ExperimentName = Literal["E1", "E2", "E3", "E4", "E5", "E6"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


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


class LaneAssumptions(Contract):
    source: Identifier
    target: Identifier
    distance_km: Nonnegative | None = None
    lead_mean: Positive | None = None
    lead_cv: Nonnegative | None = None
    delay_probability: Fraction | None = None
    delay_days: Annotated[int, Field(ge=0)] | None = None


class NetworkSpec(Contract):
    suppliers: list[Supplier] = Field(min_length=1, max_length=16)
    dcs: list[DC] = Field(min_length=1, max_length=32)
    customers: list[Customer] = Field(min_length=1, max_length=128)
    skus: list[SKU] = Field(min_length=1, max_length=100)
    transport: Transport
    inventory: Inventory
    open_dcs: list[Identifier] | None = Field(default=None, min_length=1)
    assignments: dict[Identifier, Identifier] = Field(default_factory=dict)
    lanes: list[LaneAssumptions] = Field(default_factory=list, max_length=8192)

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
        candidates = {dc.id for dc in self.dcs}
        if self.open_dcs is not None and (
            len(set(self.open_dcs)) != len(self.open_dcs) or not set(self.open_dcs) <= candidates
        ):
            raise ValueError("open DCs must be distinct known candidates")
        if not set(self.assignments) <= {c.id for c in self.customers}:
            raise ValueError("assignment references an unknown customer")
        if not set(self.assignments.values()) <= set(self.open_dcs or candidates):
            raise ValueError("customer assignments must reference open DCs")
        pairs = [(lane.source, lane.target) for lane in self.lanes]
        if len(set(pairs)) != len(pairs):
            raise ValueError("lane overrides must have unique source/target pairs")
        suppliers = {s.id for s in self.suppliers}
        customers = {c.id for c in self.customers}
        if any(
            not ((a in suppliers and b in candidates) or (a in candidates and b in customers))
            for a, b in pairs
        ):
            raise ValueError("lanes must connect supplier to DC or DC to customer")
        return self


class Seasonality(Contract):
    monthly_index_v1: list[Nonnegative] = Field(min_length=12, max_length=12)


class CanvasPosition(Contract):
    x: Annotated[float, Field(ge=-10000, le=10000)]
    y: Annotated[float, Field(ge=-10000, le=10000)]


class ModelSnapshot(Contract):
    format_version: Literal[1] = 1
    spec: NetworkSpec
    seasonality: Seasonality
    positions: dict[Identifier, CanvasPosition] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_positions(self) -> Self:
        if not set(self.positions) <= {
            n.id for n in [*self.spec.suppliers, *self.spec.dcs, *self.spec.customers]
        }:
            raise ValueError("canvas positions reference unknown facilities")
        return self


class NetworkConfig(Contract):
    dc_count: Annotated[int, Field(ge=1, le=32)] = 4
    suppliers: list[Identifier] = Field(default_factory=lambda: ["S1", "S2", "S3", "S4"])

    @model_validator(mode="after")
    def unique_suppliers(self) -> Self:
        if not self.suppliers or len(set(self.suppliers)) != len(self.suppliers):
            raise ValueError("suppliers must be nonempty and unique")
        return self


class DemandConfig(Contract):
    cv_scale: Nonnegative = 1.0
    regional_rho: Fraction = 0.3
    seasonality: Literal["monthly_index_v1"] = "monthly_index_v1"


class PolicyConfig(Contract):
    default: Literal["QR", "sS", "RS", "order_up_to"] = "QR"
    target_csl: Annotated[float, Field(gt=0, lt=1)] = 0.95
    segmentation: Literal["abc_xyz_v1"] = "abc_xyz_v1"


class BullwhipConfig(Contract):
    signal_processing: bool = True
    batching: bool = True
    price: bool = False
    rationing: bool = False
    pos_sharing: bool = False


class Disruption(Contract):
    type: Literal[
        "supplier_outage",
        "lead_time_multiplier",
        "demand_shock",
        "capacity_cut",
        "moq_change",
        "price_promo",
    ]
    target: Identifier
    start_day: Annotated[int, Field(ge=0)]
    duration: Annotated[int, Field(gt=0)]
    magnitude: Nonnegative = Field(
        description=(
            "Removed capacity fraction for outage/cut; "
            "discount fraction for promo; multiplier otherwise."
        )
    )

    @model_validator(mode="after")
    def magnitude_for_type(self) -> Self:
        if self.type in {"supplier_outage", "capacity_cut", "price_promo"} and self.magnitude > 1:
            raise ValueError("outage, capacity cut and promotion magnitudes must be fractions")
        if self.type in {"lead_time_multiplier", "moq_change"} and self.magnitude <= 0:
            raise ValueError("lead-time and MOQ multipliers must be positive")
        return self


class Scenario(Contract):
    scenario: Identifier
    horizon_days: Annotated[int, Field(gt=0)] = 365
    warmup_days: Annotated[int, Field(ge=0)] = 90
    replications: Annotated[int, Field(gt=0)] = 30
    network: NetworkConfig = Field(default_factory=NetworkConfig)
    demand: DemandConfig = Field(default_factory=DemandConfig)
    policy: PolicyConfig = Field(default_factory=PolicyConfig)
    bullwhip: BullwhipConfig = Field(default_factory=BullwhipConfig)
    disruptions: list[Disruption] = Field(default_factory=list)

    @model_validator(mode="after")
    def events_within_run(self) -> Self:
        for event in self.disruptions:
            if event.start_day + event.duration > self.warmup_days + self.horizon_days:
                raise ValueError("disruption extends beyond the simulation window")
        return self


def same_length(*columns: Sequence[object]) -> None:
    if len({len(column) for column in columns}) > 1:
        raise ValueError("column lengths must match")


class Nodes(Contract):
    id: list[Identifier]
    label: list[str]
    type: list[NodeType]
    latitude: list[Annotated[float, Field(ge=-90, le=90)]]
    longitude: list[Annotated[float, Field(ge=-180, le=180)]]

    @model_validator(mode="after")
    def aligned(self) -> Self:
        same_length(self.id, self.label, self.type, self.latitude, self.longitude)
        if len(set(self.id)) != len(self.id):
            raise ValueError("node IDs must be unique")
        return self


class Edges(Contract):
    id: list[Identifier]
    source: list[Identifier]
    target: list[Identifier]
    distance_km: list[Nonnegative]
    flow_units: list[Nonnegative]

    @model_validator(mode="after")
    def aligned(self) -> Self:
        same_length(self.id, self.source, self.target, self.distance_km, self.flow_units)
        if len(set(self.id)) != len(self.id):
            raise ValueError("edge IDs must be unique")
        return self


class Network(Contract):
    run_id: Identifier
    nodes: Nodes
    edges: Edges

    @model_validator(mode="after")
    def connected(self) -> Self:
        if not set(self.edges.source + self.edges.target).issubset(self.nodes.id):
            raise ValueError("edge endpoints must reference existing nodes")
        return self


class DailyContract(Contract):
    run_id: Identifier
    days: list[Annotated[int, Field(ge=0)]] = Field(min_length=1)

    @model_validator(mode="after")
    def ordered_days(self) -> Self:
        if self.days != sorted(set(self.days)):
            raise ValueError("days must be unique and increasing")
        return self


class Health(DailyContract):
    node_ids: list[Identifier]
    days_of_cover: list[list[Nonnegative | None]]
    stockout: list[list[bool]]

    @model_validator(mode="after")
    def rectangular(self) -> Self:
        same_length(self.node_ids, self.days_of_cover, self.stockout)
        if len(set(self.node_ids)) != len(self.node_ids):
            raise ValueError("node IDs must be unique")
        rows: list[Sequence[object]] = [*self.days_of_cover, *self.stockout]
        for row in rows:
            same_length(self.days, row)
        return self


class TimeSeries(DailyContract):
    node_id: Identifier
    sku_id: Identifier
    metrics: dict[SeriesMetric, list[Nonnegative | None]] = Field(min_length=1)

    @model_validator(mode="after")
    def aligned(self) -> Self:
        for metric, values in self.metrics.items():
            same_length(self.days, values)
            if metric == "fill_rate" and any(v is not None and v > 1 for v in values):
                raise ValueError("fill_rate must be a fraction")
        return self


class Estimate(Contract):
    mean: float | None
    ci95: list[float] | None = Field(default=None, min_length=2, max_length=2)

    @model_validator(mode="after")
    def interval(self) -> Self:
        if self.ci95 is not None and (
            self.mean is None or not self.ci95[0] <= self.mean <= self.ci95[1]
        ):
            raise ValueError("CI must contain the mean and have ordered bounds")
        return self


class Kpis(Contract):
    run_id: Identifier
    node_id: Identifier | None = None
    replications: Annotated[int, Field(gt=0)]
    metrics: dict[
        Literal[
            "fill_rate",
            "cycle_service_level",
            "stockout_days",
            "inventory_turns",
            "days_of_inventory",
            "cash_to_cash_days",
            "otif",
            "total_landed_cost_inr",
            "bullwhip_ratio",
        ],
        Estimate,
    ] = Field(min_length=1)

    @model_validator(mode="after")
    def valid_estimates(self) -> Self:
        for name, estimate in self.metrics.items():
            if self.replications == 1 and estimate.ci95 is not None:
                raise ValueError("a single replication cannot have a confidence interval")
            if estimate.mean is None:
                continue
            if name in {"fill_rate", "cycle_service_level", "otif"}:
                if not 0 <= estimate.mean <= 1:
                    raise ValueError("service metrics must be fractions")
            elif name != "cash_to_cash_days" and estimate.mean < 0:
                raise ValueError("this KPI cannot be negative")
        return self


class Query(Contract):
    node_type: NodeType | None = None
    metric: Metric
    operator: Literal["lt", "le", "eq", "ge", "gt"]
    value: Nonnegative

    @model_validator(mode="after")
    def service_fraction(self) -> Self:
        if self.metric == "fill_rate" and self.value > 1:
            raise ValueError("fill-rate filter values must be fractions")
        return self


class ScenarioOverrides(Contract):
    horizon_days: Annotated[int, Field(gt=0)] | None = None
    warmup_days: Annotated[int, Field(ge=0)] | None = None
    network: NetworkConfig | None = None
    demand: DemandConfig | None = None
    policy: PolicyConfig | None = None
    bullwhip: BullwhipConfig | None = None
    disruptions: list[Disruption] | None = None


class RunOptions(Contract):
    forecasting: bool = False
    segmented: bool = False
    bullwhip: bool = False
    lost_sales: bool = False


class SupplierAssumptions(Contract):
    lead_mean: Annotated[float, Field(gt=0)] | None = None
    lead_cv: Nonnegative | None = None
    delay_probability: Fraction | None = None
    delay_days: Annotated[int, Field(ge=0)] | None = None
    daily_capacity: Nonnegative | None = None
    price_multiplier: Annotated[float, Field(gt=0)] | None = None
    moq: Annotated[int, Field(gt=0)] | None = None


class SkuAssumptions(Contract):
    daily_mean: Nonnegative | None = None
    cv: Nonnegative | None = None
    unit_cost: Annotated[float, Field(gt=0)] | None = None
    supplier: Identifier | None = None
    moq: Annotated[int, Field(gt=0)] | None = None
    pack_size: Annotated[int, Field(gt=0)] | None = None


class LabSettings(Contract):
    monthly_index: list[Nonnegative] | None = Field(default=None, min_length=12, max_length=12)
    suppliers: dict[Identifier, SupplierAssumptions] = Field(default_factory=dict)
    skus: dict[Identifier, SkuAssumptions] = Field(default_factory=dict)
    dc_capacity_factor: Nonnegative = 1
    forecast_method: Literal["moving_average", "ses", "holt"] | None = None
    forecast_window: Annotated[int, Field(ge=1, le=3650)] | None = None
    forecast_alpha: Annotated[float, Field(gt=0, le=1)] | None = None
    forecast_beta: Fraction | None = None
    buffer_days: Nonnegative = 0
    expedite_factor: Annotated[float, Field(gt=0, le=1)] = 1
    expedite_unit_cost: Nonnegative = 0
    backup_suppliers: dict[Identifier, Identifier] = Field(default_factory=dict)

    @model_validator(mode="after")
    def distinct_backup(self) -> Self:
        if any(primary == backup for primary, backup in self.backup_suppliers.items()):
            raise ValueError("backup suppliers must differ from their primary supplier")
        return self


class RunRequest(Contract):
    preset: Identifier = "base_4dc"
    overrides: ScenarioOverrides = Field(default_factory=ScenarioOverrides)
    seed: Annotated[int, Field(ge=0, le=4294967295)] = 0
    replications: Annotated[int, Field(gt=0)] = 1
    options: RunOptions = Field(default_factory=RunOptions)
    lab: LabSettings = Field(default_factory=LabSettings)
    model: ModelSnapshot | None = None

    @model_validator(mode="after")
    def compatible_options(self) -> Self:
        if self.options.segmented and self.options.bullwhip:
            raise ValueError("bullwhip runs require uniform planning")
        return self


class PortfolioDraft(Contract):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    notes: Annotated[str, Field(max_length=10000)] = ""
    request: RunRequest

    @model_validator(mode="after")
    def meaningful_name(self) -> Self:
        if not self.name.strip():
            raise ValueError("scenario name must not be blank")
        return self


class PortfolioUpdate(PortfolioDraft):
    revision: Annotated[int, Field(ge=1)]


class SavedScenario(PortfolioDraft):
    id: Identifier
    revision: Annotated[int, Field(ge=1)]
    created_at: str
    updated_at: str


class LaunchRequest(Contract):
    revision: Annotated[int, Field(ge=1)]
    execution_id: Identifier | None = None


class ApiError(Contract):
    detail: str
    issues: list[str] = Field(default_factory=list)


class RunStatus(Contract):
    run_id: Identifier
    status: Literal["queued", "running", "complete", "failed"]
    seed: Annotated[int, Field(ge=0)]
    replications: Annotated[int, Field(gt=0)]
    representative_seed: Annotated[int, Field(ge=0)]
    error: str | None = None


class ScenarioCatalog(Contract):
    presets: dict[Identifier, Scenario]


class PortfolioExecution(Contract):
    id: Identifier
    scenario_id: Identifier
    revision: Annotated[int, Field(ge=1)]
    name: str
    notes: str
    request: RunRequest
    launched_at: str
    status: RunStatus


class DiagnosticSite(Contract):
    id: Identifier
    label: str
    kind: NodeType
    demand_units: Nonnegative
    shortage_units: Nonnegative
    inventory_value_inr: Nonnegative
    cost_inr: Nonnegative
    utilization: Nonnegative | None


class DiagnosticSku(Contract):
    id: Identifier
    label: str
    demand_units: Nonnegative
    shortage_units: Nonnegative
    inventory_value_inr: Nonnegative
    forecast_wmape: Nonnegative | None
    forecast_bias: float | None


class DiagnosticLane(Contract):
    id: Identifier
    source: Identifier
    target: Identifier
    shipped_units: Nonnegative
    freight_inr: Nonnegative
    closing_in_transit_units: Nonnegative


class RunDiagnostics(Contract):
    run_id: Identifier
    representative_seed: Annotated[int, Field(ge=0)]
    warmup_days: Annotated[int, Field(ge=0)]
    horizon_days: Annotated[int, Field(gt=0)]
    facilities: list[DiagnosticSite]
    skus: list[DiagnosticSku]
    lanes: list[DiagnosticLane]
    cost_components: dict[Identifier, Nonnegative]


class RunProvenance(Contract):
    run_id: Identifier
    request: RunRequest
    scenario: Scenario
    input_sha256: dict[str, str]
    versions: dict[str, str]
    settings: dict[str, JsonValue]
    replication_seeds: list[Annotated[int, Field(ge=0)]]
    training_seed: Annotated[int, Field(ge=0)]
    operating_snapshot: dict[str, JsonValue] | None = None


class SupplierProfile(SupplierAssumptions):
    id: Identifier
    label: str


class LabCatalog(Contract):
    request: RunRequest
    suppliers: list[SupplierProfile]
    sku_ids: list[Identifier]
    monthly_index: list[Nonnegative] = Field(min_length=12, max_length=12)
    seasonal_example: list[Nonnegative] = Field(min_length=12, max_length=12)
    forecast: LabSettings
    max_replications: Annotated[int, Field(gt=0)]
    max_horizon_days: Annotated[int, Field(gt=0)]
    max_warmup_days: Annotated[int, Field(gt=0)]


class BuilderCatalog(Contract):
    request: RunRequest
    max_observation_cells: PositiveInt


class ModelPreview(Contract):
    network: Network
    sku_ids: list[Identifier]
    open_dcs: list[Identifier]
    assignments: dict[Identifier, Identifier]
    lanes: list[LaneAssumptions]
    warnings: list[str]


class PolicyTargets(Contract):
    basis: Literal["nominal_initial_targets"] = "nominal_initial_targets"
    reorder_point: list[list[Nonnegative]]
    order_quantity: list[list[Nonnegative]]


class RunNetwork(Contract):
    network: Network
    kpis: Kpis
    sku_ids: list[Identifier]
    policy: PolicyTargets | None = None
    warmup_days: Annotated[int, Field(ge=0)] | None = None

    @model_validator(mode="after")
    def aligned_run(self) -> Self:
        if self.network.run_id != self.kpis.run_id:
            raise ValueError("network and KPIs must identify the same run")
        if self.policy is not None:
            for matrix in (self.policy.reorder_point, self.policy.order_quantity):
                same_length(self.sku_ids, matrix)
                for row in matrix:
                    same_length(self.network.nodes.id, row)
        return self


class QueryRequest(Contract):
    filter: Query | None = None
    text: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    day: Annotated[int, Field(ge=0)] | None = None

    @model_validator(mode="after")
    def one_filter(self) -> Self:
        if (self.filter is None) == (self.text is None):
            raise ValueError("supply exactly one filter or query phrase")
        return self


class QueryResults(Contract):
    run_id: Identifier
    day: Annotated[int, Field(ge=0)]
    filter: Query
    node_ids: list[Identifier]
    node_types: list[NodeType]
    values: list[Nonnegative]

    @model_validator(mode="after")
    def aligned(self) -> Self:
        same_length(self.node_ids, self.node_types, self.values)
        return self


class CostComparison(Contract):
    component: list[Identifier]
    a: list[float | None]
    b: list[float | None]
    delta: list[float | None]
    ci95_low: list[float | None]
    ci95_high: list[float | None]

    @model_validator(mode="after")
    def aligned(self) -> Self:
        same_length(self.component, self.a, self.b, self.delta, self.ci95_low, self.ci95_high)
        return self


class Comparison(Contract):
    run_a: Identifier
    run_b: Identifier
    replications: Annotated[int, Field(gt=0)]
    metrics: dict[KpiMetric, Estimate] = Field(min_length=1)
    costs: CostComparison


class ExperimentResults(Contract):
    experiment: ExperimentName
    config_hash: str
    total: Annotated[int, Field(ge=0)]
    offset: Annotated[int, Field(ge=0)]
    case_id: list[Identifier]
    phase: list[Literal["validation", "screen", "confirm", "calibration", "evaluation"]]
    replication: list[Annotated[int, Field(ge=0)]]
    seed: list[Annotated[int, Field(ge=0)]]
    metric: list[Identifier]
    value: list[float | None]

    @model_validator(mode="after")
    def aligned(self) -> Self:
        same_length(self.case_id, self.phase, self.replication, self.seed, self.metric, self.value)
        return self


class ExperimentRow(Contract):
    experiment: Literal["E1", "E2", "E3", "E4", "E5", "E6"]
    case_id: Identifier
    phase: Literal["validation", "screen", "confirm", "calibration", "evaluation"]
    replication: Annotated[int, Field(ge=0)]
    seed: Annotated[int, Field(ge=0)]
    metric: Identifier
    value: float | None


class StudyEstimate(Contract):
    phase: str
    case_id: Identifier
    metric: Identifier
    n: Annotated[int, Field(ge=0)]
    missing: Annotated[int, Field(ge=0)]
    mean: float | None
    low: float | None
    high: float | None
    baseline: Identifier | None = None
    countermeasure: str | None = None


class StudyCase(Contract):
    case_id: Identifier
    factors: dict[str, str | int | float | bool]


class StudyExperiment(Contract):
    config_hash: str
    cases: list[StudyCase]
    estimates: list[StudyEstimate]
    paired_differences: list[StudyEstimate]
    source: str


class ObservationSeries(Contract):
    label: str
    source: str
    seed: Annotated[int, Field(ge=0)] | None = None
    days: list[int | float]
    columns: dict[Identifier, list[float | None]]

    @model_validator(mode="after")
    def aligned(self) -> Self:
        for column in self.columns.values():
            same_length(self.days, column)
        return self


class EventControl(Contract):
    type: str
    target: Identifier
    neutral: Nonnegative
    minimum: Nonnegative
    maximum: Nonnegative
    step: Annotated[float, Field(gt=0)]


class StudyDefaults(Contract):
    seed: Annotated[int, Field(ge=0)]
    replications: Annotated[int, Field(ge=1)]
    warmup_days: Annotated[int, Field(ge=0)]
    horizon_days: Annotated[int, Field(gt=0)]
    baseline_dcs: Literal[1, 2, 4, 8]
    alternative_dcs: Literal[1, 2, 4, 8]
    event_start: Annotated[int, Field(ge=0)]
    event_duration: Annotated[int, Field(gt=0)]
    events: list[EventControl]
    inventory_display_days: Annotated[int, Field(gt=0)]
    quantity_range: list[float] = Field(min_length=2, max_length=2)
    quantity_step: Annotated[float, Field(gt=0)]
    default_demand_cv: Nonnegative
    default_rho: Fraction
    default_outbound_factor: Nonnegative
    default_inbound_days: Nonnegative


class StudyPair(Contract):
    a: RunStatus
    b: RunStatus
    network_a: RunNetwork
    network_b: RunNetwork
    comparison: Comparison

    @model_validator(mode="after")
    def paired(self) -> Self:
        if self.a.seed != self.b.seed or self.a.replications != self.b.replications:
            raise ValueError("paired scenarios require matching seeds and replication counts")
        if (self.a.run_id, self.b.run_id) != (self.comparison.run_a, self.comparison.run_b):
            raise ValueError("comparison must identify the paired runs")
        return self


class InventoryExample(Contract):
    annual_demand: Nonnegative
    order_cost: Annotated[float, Field(gt=0)]
    holding_cost: Annotated[float, Field(gt=0)]
    quantity: Annotated[float, Field(gt=0)]
    series: ObservationSeries


class ResilienceExample(Contract):
    event: Disruption
    series: ObservationSeries
    metrics: dict[Identifier, float | None]


class ParameterNote(Contract):
    parameter: str
    value: str
    source: str


class StudyEvidence(Contract):
    defaults: StudyDefaults
    experiments: dict[ExperimentName, StudyExperiment]
    pair: StudyPair
    networks: dict[Identifier, Network]
    inventory: InventoryExample
    bullwhip_series: dict[Identifier, ObservationSeries]
    resilience_series: dict[Identifier, ResilienceExample]
    theory: ObservationSeries
    parameters: list[ParameterNote]
    validation: list[ParameterNote]


class CaseGoals(Contract):
    service_floor: Fraction | None = None
    cost_ceiling_inr: Nonnegative | None = None
    inventory_ceiling_days: Nonnegative | None = None


class DecisionCaseDraft(Contract):
    format_version: Literal[1] = 1
    name: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=2000)
    assumptions: str = Field(default="", max_length=10000)
    prediction: str = Field(default="", max_length=4000)
    observations: str = Field(default="", max_length=10000)
    reflection: str = Field(default="", max_length=4000)
    decision: str = Field(default="", max_length=10000)
    lesson_id: Identifier | None = None
    goals: CaseGoals = Field(default_factory=CaseGoals)
    baseline: RunRequest
    alternative: RunRequest

    @model_validator(mode="after")
    def paired_definition(self) -> Self:
        if not self.name.strip() or not self.question.strip():
            raise ValueError("Case name and operating question must contain text")
        if (self.baseline.seed, self.baseline.replications) != (
            self.alternative.seed,
            self.alternative.replications,
        ):
            raise ValueError("Case conditions require matching seeds and replication counts")
        return self


class DecisionCaseUpdate(DecisionCaseDraft):
    revision: int = Field(ge=1)


class SavedDecisionCase(DecisionCaseUpdate):
    id: Identifier
    created_at: str
    updated_at: str


class CaseExecution(Contract):
    id: Identifier
    case_id: Identifier
    launched_at: str
    origin: Literal["case_launch", "attached"]
    snapshot: SavedDecisionCase
    run_a: Identifier
    run_b: Identifier
    status_a: RunStatus | None = None
    status_b: RunStatus | None = None
    evidence_available: bool = False

    @model_validator(mode="after")
    def aligned_execution(self) -> Self:
        if self.case_id != self.snapshot.id:
            raise ValueError("Execution must identify its case snapshot")
        for status, identity, request in (
            (self.status_a, self.run_a, self.snapshot.baseline),
            (self.status_b, self.run_b, self.snapshot.alternative),
        ):
            if status is not None and (
                status.run_id != identity
                or status.seed != request.seed
                or status.replications != request.replications
            ):
                raise ValueError("Run status must match its case condition")
        return self


class CaseEvidence(Contract):
    execution: CaseExecution
    comparison: Comparison
    a: Kpis
    b: Kpis
    provenance: list[RunProvenance] = Field(min_length=2, max_length=2)
    diagnostics: RunDiagnostics | None = None

    @model_validator(mode="after")
    def aligned_evidence(self) -> Self:
        pair = (self.execution.run_a, self.execution.run_b)
        if (
            pair != (self.comparison.run_a, self.comparison.run_b)
            or pair != (self.a.run_id, self.b.run_id)
            or pair != tuple(row.run_id for row in self.provenance)
        ):
            raise ValueError("Case evidence must identify the same ordered run pair")
        if self.execution.case_id != self.execution.snapshot.id:
            raise ValueError("Execution must identify its case snapshot")
        requests = (self.execution.snapshot.baseline, self.execution.snapshot.alternative)
        if any(request != row.request for request, row in zip(requests, self.provenance)):
            raise ValueError("Provenance requests must match the execution snapshot")
        if any(kpis.replications != self.comparison.replications for kpis in (self.a, self.b)):
            raise ValueError("KPI replication counts must match the comparison")
        if self.comparison.replications != requests[0].replications:
            raise ValueError("Comparison replication count must match the case")
        if self.provenance[0].replication_seeds != self.provenance[1].replication_seeds:
            raise ValueError("Paired evidence requires matching replication streams")
        if self.provenance[0].input_sha256 != self.provenance[1].input_sha256:
            raise ValueError("Paired evidence requires matching source fingerprints")
        if self.diagnostics is not None and self.diagnostics.run_id != pair[1]:
            raise ValueError("Diagnostics must identify condition B")
        return self


class CasePackage(Contract):
    format: Literal["openscm-case-v1"]
    definition: DecisionCaseDraft
    evidence: CaseEvidence | None = None


class CaseDetail(Contract):
    case: SavedDecisionCase
    imported_evidence: CaseEvidence | None = None


class AttachCaseRuns(Contract):
    revision: int = Field(ge=1)
    run_a: Identifier
    run_b: Identifier


CONTRACTS: dict[str, type[Contract]] = {
    "decision_case": SavedDecisionCase,
    "case_execution": CaseExecution,
    "case_evidence": CaseEvidence,
    "case_package": CasePackage,
    "case_detail": CaseDetail,
    "model_snapshot": ModelSnapshot,
    "builder_catalog": BuilderCatalog,
    "model_preview": ModelPreview,
    "network_spec": NetworkSpec,
    "lab_settings": LabSettings,
    "lab_catalog": LabCatalog,
    "saved_scenario": SavedScenario,
    "portfolio_execution": PortfolioExecution,
    "run_diagnostics": RunDiagnostics,
    "run_provenance": RunProvenance,
    "study_evidence": StudyEvidence,
    "api_error": ApiError,
    "run_request": RunRequest,
    "run_status": RunStatus,
    "scenario_catalog": ScenarioCatalog,
    "run_network": RunNetwork,
    "query_request": QueryRequest,
    "query_results": QueryResults,
    "comparison": Comparison,
    "experiment_results": ExperimentResults,
    "experiment_row": ExperimentRow,
    "scenario": Scenario,
    "network": Network,
    "health": Health,
    "timeseries": TimeSeries,
    "kpis": Kpis,
    "query": Query,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail on stale schemas; write nothing")
    args = parser.parse_args()
    for name, model in CONTRACTS.items():
        path = Path("contracts") / f"{name}.schema.json"
        schema = model.model_json_schema()
        if args.check:
            if not path.exists() or json.loads(path.read_text(encoding="utf-8")) != schema:
                raise SystemExit(f"Stale contract: {path}; run python -m scm.contracts")
        else:
            path.parent.mkdir(exist_ok=True)
            path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
