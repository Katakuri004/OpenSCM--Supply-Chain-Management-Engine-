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
