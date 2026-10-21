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
with their implementations in M7–M8. Disruption magnitude semantics and referenced
target existence must be defined and validated with the engine in M3/M6; M0 only
checks event shape, nonnegative magnitude and bounds of the simulation window.
