# Data contracts, version 0.1

Initial contract creation (M0): six JSON Schemas and synthetic fixtures establish
the scenario and read-payload vocabulary before engine and frontend work.
Schemas are committed artifacts generated from `engine/src/scm/contracts.py`.
Consumers use these schemas; `python -m scm.contracts --check` prevents drift.
Run `python -m scm.contracts` after an explained model change, then `make check`.

- `scenario`: configuration matching `configs/base_4dc.yaml`.
- `network`: columnar node and edge attributes; edge endpoints are node IDs.
- `health`: node-by-day matrices, row order from `node_ids`, column order from `days`.
- `timeseries`: one node/SKU with aligned metric columns.
- `kpis`: network (`node_id: null`) or node estimates with optional 95% intervals.
- `query`: a single typed filter, with whitelisted metrics and operators.
- `experiment_row`: one M7 experiment metric, with case, phase, replication and seed.

Days are zero-based from simulation start, including warm-up. In the base scenario,
days 0–89 are warm-up and 90–454 are measured. Time axes must be increasing and unique.
Rates are fractions (0.95, not 95). Units are units, days, km and INR as field names
indicate. Inventory quantities may be fractional. Coordinates use decimal degrees.
`null` means undefined/unavailable (e.g. cover with zero forecast or a ratio with
zero denominator). NaN and infinity are forbidden. A single replication has no CI.

JSON Schema checks field constraints. Pydantic additionally checks column alignment,
matrix dimensions, unique IDs, edge references and interval ordering; consumers
must preserve these invariants. Unknown fields are rejected.

All `synthetic_m0` fixtures are arbitrary examples for contract/UI testing, not
simulation outputs, measured Indian geography, or evidence for the report. The
three-node fixture is intentionally independent of the four-DC scenario preset.

OpenAPI, run lifecycle, comparison and experiment response contracts will be added
with their implementations in M7–M8.

## M6 disruption semantics

M6 retains the existing event fields and type names, adds a magnitude description
to the regenerated scenario schema, and validates type-dependent magnitude bounds
in Pydantic. Fractions for `supplier_outage`, `capacity_cut`, and `price_promo` must
lie in [0, 1]. Lead and MOQ multipliers must be positive; demand multipliers can be
zero. Callers that previously passed invalid fractions now receive validation errors.
No response payload shapes change. JSON Schema still checks the common nonnegative
bound; consumers must also use the type-dependent rules above, like the existing
cross-column invariants. The engine validates targets against the selected network
and event bounds against the actual supplied simulation inputs.

`scenario_disruption.json` is an additional synthetic scenario fixture validated
against the schema and model. The original base scenario fixture remains aligned
with `configs/base_4dc.yaml`. The loader, network builder and network simulation now
accept nonempty event lists. See [event targets and timing](../docs/resilience.md)
for operational semantics; identifiers reference actual selected nodes or lane IDs
from the network contract. Resilience metrics remain internal until M8 response
contracts are implemented.

## M7 experiment records

M7 adds `ExperimentRow` in the Pydantic models, its generated
`experiment_row.schema.json`, and a synthetic fixture. This new contract makes
Parquet output readable by later experiment consumers without changing existing
scenario or response payloads. The writer validates records, fixes column order
from the model, and writes seven fields: experiment, case_id, phase,
replication, seed, metric and value. Value is nullable.
Experiment is E1–E6, phase is validation/screen/confirm/calibration/evaluation,
and replication and seed are nonnegative integers. The Arrow storage types are
string, string, string, int64, int64, string and float64, respectively.

Records are unique on (phase, case_id, replication, metric) within an experiment
artifact. Undefined service or resilience observations use null, never zero.
NaN and infinity are forbidden in serialized records. E2–E6 case IDs resolve through
the factor mappings saved in each manifest. E1 retains named validation checks and
`q_<index>` identifiers from the legacy quantity sweep; quantity is an explicit metric
and the nested validation artifacts provide its benchmark configuration. Metrics with `_inr` use INR;
`tts_days` and `ttr_days` use elapsed days; service rates are fractions; BWE metrics
are variance ratios. See [experiment methods](../docs/experiments.md) for horizons,
cost conventions and derived marginal service costs.

M8 will define experiment API envelopes. M7's `summary.json` and manifests are
internal analytical artifacts, not substitutes for those response contracts.

## M8 API contracts and generated client

M8 adds nine public models and matching generated schemas/fixtures: `RunRequest`,
`RunStatus`, `ScenarioCatalog`, `RunNetwork`, `QueryRequest`, `QueryResults`,
`Comparison`, `ExperimentResults` and `ApiError`. `RunNetwork` wraps the existing
network payload with aggregate KPIs and SKU identifiers. Existing standalone network,
health, time-series and KPI payload shapes remain usable. The new catalog is a
preset mapping; query matches, cost stacks and experiment pages use aligned columns.

`Query` now rejects fill-rate thresholds above one at runtime. Percentages are
converted by the phrase parser; structured filter values remain fractions. This
cross-field constraint is enforced by Pydantic, in addition to the common schema
nonnegative bound. `RunRequest` uses typed, optional override sections, rather than
an arbitrary dictionary. Explicit fields merge with the preset. Options activate
forecasting, segmentation, bullwhip behavior or lost sales; segmented bullwhip runs
are rejected. Seeds must fit an unsigned 32-bit integer. Server resource limits are
validated against `configs/api.yaml`.

`contracts/openapi.json` is exported from these models and the live FastAPI routes.
The declared POST responses cover synchronous creation (201), cache hits (200), and
background jobs (202). A status endpoint supports polling. Validation failures have
a consistent `ApiError` body. Cross-column constraints remain Pydantic checks.

`web/src/lib/api/schema.ts` is generated from OpenAPI by pinned openapi-typescript;
`client.ts` uses openapi-fetch with those types. Generator settings preserve optional
request defaults. Generated TypeScript has fixed LF line endings so Windows checkout
does not create false drift. No endpoint interfaces are handwritten in the client.
Both generated artifacts have read-only drift checks, and the TypeScript compiler
checks valid calls plus deliberately invalid paths, seed types and metric names.

The nine new fixtures are arbitrary synthetic examples, not measured results. M8
API evidence is separately generated in `docs/evidence/m8`. See [API methods](../docs/api.md)
for replication, null-value, KPI and comparison conventions.
