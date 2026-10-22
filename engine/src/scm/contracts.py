"""M0 wire contracts. Generate JSON Schema with python -m scm.contracts."""

import argparse
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Nonnegative = Annotated[float, Field(ge=0)]
Fraction = Annotated[float, Field(ge=0, le=1)]
Identifier = Annotated[str, Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")]
NodeType = Literal["supplier", "dc", "retailer", "b2b"]
Metric = Literal["days_of_cover", "fill_rate", "on_hand", "on_order", "backorders"]
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


class NetworkConfig(Contract):
    dc_count: Literal[1, 2, 4, 8] = 4
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
    metrics: dict[Metric, list[Nonnegative | None]] = Field(min_length=1)

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


class RunRequest(Contract):
    preset: Identifier = "base_4dc"
    overrides: ScenarioOverrides = Field(default_factory=ScenarioOverrides)
    seed: Annotated[int, Field(ge=0, le=4294967295)] = 0
    replications: Annotated[int, Field(gt=0)] = 1
    options: RunOptions = Field(default_factory=RunOptions)

    @model_validator(mode="after")
    def compatible_options(self) -> Self:
        if self.options.segmented and self.options.bullwhip:
            raise ValueError("bullwhip runs require uniform planning")
        return self


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


CONTRACTS: dict[str, type[Contract]] = {
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
