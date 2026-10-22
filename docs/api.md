# M8 API, DuckDB queries and typed client

Run from the repository root with the Python and npm dependencies installed:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000
```

Use one Uvicorn server worker. Background jobs share one local queue and execute
sequentially, with parallel replications inside a job. This is a local study service;
durable distributed scheduling, authentication and deployment are outside M8.
The process must be restarted after changing YAML configuration. The interactive
documentation is available at `/docs`, with its machine-readable document at
`/openapi.json`.

## Requests and lifecycle

`GET /scenarios` returns the registered `base_4dc` preset. Creating a run accepts:

```json
{
  "preset": "base_4dc",
  "seed": 808,
  "replications": 2,
  "overrides": {"network": {"dc_count": 2}},
  "options": {"forecasting": false, "segmented": false, "bullwhip": false, "lost_sales": false}
}
```

Only explicitly supplied override fields replace preset values, including within
network, demand, policy and bullwhip sections. The combined scenario is validated
before queuing, including disruption targets and event bounds. Unknown presets are
404; malformed requests and resource-limit violations are 422; a full queue is 503.
API seed defaults to zero and replications to one. Request options are explicit:

- Empty options retain the classic M3 known-demand policies.
- Forecasting enables the historical planner; segmentation also enables it and
  applies the configured ABC–XYZ map.
- Bullwhip enables M5's uniform order-up-to mechanism and scenario cause flags.
  Signal processing automatically obtains the required planner/history. Bullwhip
  and segmentation cannot be selected together.
- Lost sales replaces customer backlog accumulation. Disruptions apply in every mode.

One replication completes synchronously with status 201. Multiple replications
return 202 and a run ID; poll `GET /runs/{run_id}` until complete or failed. Reading
results from an incomplete run returns 409. Successful duplicate requests return
the completed cache with status 200. Duplicate pending requests reuse the same ID
without starting another job. Failed runs can be resubmitted. On restart, unfinished
local jobs become failed and can be retried.

Runs are stored under `data/runs/<hash>`. The hash includes the resolved scenario,
seed, replication count, policy options, API settings, input/source hashes and recorded numerical/API package
versions. Status and metadata updates replace files atomically; a run is marked
complete only after its output files and checksums are written. Configuration is
snapshotted by the run store. A different seed, replication count, policy mode,
effective override or source fingerprint produces a different cache identity.
Redundant overrides reuse the same identity; the original request is retained in
the manifest for provenance. Paths supplied
through run IDs are restricted to 64 hexadecimal characters and the cache root.

## Read endpoints

`SCM_RUN_ROOT` can set the run-cache location for a server process; it defaults to
`data/runs`. The planning SQLite database is placed in that directory's parent.
Tests pass an explicit temporary root or use the browser workspace. Restart after
changing this setting. The API remains one local workspace without authentication.

| Endpoint | Result and convention |
| --- | --- |
| `GET /runs/{id}/network` | Static network, representative measured lane flows, SKU IDs and aggregate KPI estimates |
| `GET /runs/{id}/health` | Entire node × day cover/stockout matrix, including warm-up; scrub this matrix locally |
| `GET /runs/{id}/timeseries` | `node`, `sku`, repeated `metrics`, inclusive `start_day`/`end_day`; defaults to measured days and all five metrics |
| `GET /runs/{id}/kpis` | Network estimates, or node estimates with `?node=R01` |
| `POST /runs/{id}/query` | Structured filter or supported phrase, optional day; defaults to the final simulation day |
| `GET /compare?a=...&b=...` | Paired B−A KPI and eight-component cost deltas |
| `GET /experiments/E1` through `E6` | Columnar pages from M7 Parquet evidence; supports `offset`, `limit`, `case_id` and `metric` |
| `GET /studies` | M10 validated historical study bundle; identical to the fixed recorded asset, 404 if not exported |
| `GET /lab` | YAML-derived planning defaults, supplier profiles and local resource limits |
| `POST /lab/validate` | Resolve a typed request and physical targets without reserving or executing a run |
| `GET/POST /portfolio` | List/create server-persisted named configurations with notes |
| `PUT /portfolio/{id}` | Save a new revision, with optimistic 409 conflict detection |
| `GET/POST /portfolio/{id}/runs` | Immutable launch history / launch saved revision or repeat an execution's original request |
| `GET /runs/{id}/diagnostics` | Reconciled first-replication SKU, facility and lane contributors; 404 for older absent artifacts |
| `GET /runs/{id}/provenance` | Request, effective inputs, versions, source hashes and seeds |

The first replication is the **representative trajectory** for network flows,
health, inspector time series and node queries. Its seed is returned in run status.
KPI means and 95% Student t intervals use all independent replications. This avoids
presenting an averaged stock trajectory as a physical inventory balance. One
replication has no interval; undefined metrics are null. Changing replication count
retains the first seed, but creates a different run ID.

SeedSequence branches separate training and evaluation. Replication seeds depend
on the requested seed and index, not scenario factors. Comparisons require identical
seed lists, replication counts, warm-up and measured windows; otherwise they return
409. Paired intervals use per-seed differences. Rate/cost differences may be negative.
The cost stack's mean deltas sum to the total landed-cost delta up to floating-point
roundoff. These are paired scenario effects, not automatically causal operating estimates.

Experiment pages are bounded by configured limits and ordered by phase, case,
replication and metric. `total` is the row count after filters. Their source file must
match its M7 Parquet checksum; a mismatch returns 409. The response includes the
source configuration hash. Case-factor mappings and statistical summaries remain in
the corresponding M7 manifest and summary artifacts. This endpoint reads evidence;
it does not start an experiment sweep.

## Query grammar and safety

```json
{"text":"warehouses with days of cover < 7", "day":120}
```

Or send a structured filter:

```json
{"filter":{"node_type":"retailer","metric":"fill_rate","operator":"lt","value":0.95}}
```

Supply exactly one text or structured filter. Supported groups are nodes, warehouses,
DCs, retailers, suppliers and buyers. Metrics are days of cover, fill rate, on hand,
on order and backorders. Operators are `<`, `<=`, `=`, `>=` and `>`. Percentages are
accepted only for fill rate, such as `retailers with fill rate < 95%`. Phrases are
bounded and matched against this grammar; there is no LLM or free-form SQL execution.

DuckDB reads a cached columnar node/day Parquet table. Columns and operators come
only from fixed whitelists; paths, days, values and node types are bound parameters.
Null observations do not match numeric comparisons. Results are sorted by node ID
and return aligned node IDs, types and measured values with the normalized filter.
Property tests compare DuckDB results against Python predicates, including all
operators, node types, nulls and randomized numeric thresholds. Separate fuzz tests
check arbitrary phrases, and API tests reject SQL-injection attempts.

## KPI definitions

Customer nodes observe external consumption. DCs and suppliers observe incoming
replenishment orders. An optional engine log records source fulfillment **only for
orders placed that day**, so delayed FIFO shipments are excluded from immediate
service. Supplier raw material is unlimited while dispatch capacity is finite;
suppliers hold no stocked raw material or upstream purchase pipeline.

| Metric | Calculation |
| --- | --- |
| Fill rate | Immediate units / observed demand; network scope includes customers only |
| Cycle service level | Successful receipt-to-receipt SKU/node cycles / completed cycles; network scope includes customer cycles |
| Stockout days | Days with any SKU service shortfall or backlog at a node; network scope is days with any affected customer, not a sum of node-days |
| Inventory turns | Annualized base-valued dispatched/fulfilled units / average base-valued on-hand; network COGS includes customer fulfillment only to avoid double counting echelons |
| Days of inventory | 365 / turns, null when undefined |
| Cash-to-cash days | DIO + configured DSO − configured DPO |
| OTIF | Share of positive SKU/node-day demand lines completely served immediately; a daily line-service proxy |
| Total landed cost | All eight measured cost accounts, with existing node cost attribution |
| Bullwhip ratio | Weekly order variance / downstream consumption variance; network numerator is total DC orders |

Cycles exclude incomplete cycles and those starting during warm-up. Partial receipts
close cycles under the existing receipt-day convention. Suppliers have no receipt
cycles, so their CSL is null. OTIF does not model commercial delivery promises or
multiple intraday customer orders. Transfers and demand may be fractional. Inventory
valuation and COGS use primary base SKU unit values, consistently with the engine.
These conventions are approximations, not calibrated accounting or contractual service.

Days of cover use on-hand divided by nominal demand or the recorded forecast. Node
cover divides total stock by total expected demand, rather than averaging SKU covers.
Backorders include waiting source orders for DCs/suppliers and customer backlog at
customers. Tiny numerical residue is floored at zero in serialized state; raw engine
balances remain tested. Daily zero-demand fill/cover and insufficient weekly variance
observations return null. BWE requires at least two complete post-warm-up weeks.
Intervals are ordinary unbounded t intervals and can extend beyond physical rate bounds.

## Generated client and checks

```powershell
.\.venv\Scripts\python.exe -m scm.contracts
.\.venv\Scripts\python.exe -m scm.openapi
npm run generate:api --prefix web
.\.venv\Scripts\python.exe -m scm.check
```

`make contracts` performs all three generation steps. Check mode compares committed
schemas, OpenAPI and TypeScript without rewriting them. CI installs the pinned npm
packages and runs these checks plus strict Python and TypeScript checks. Defaults
remain optional in generated request types. The client is used through:

```typescript
import { createSupplyChainClient } from "./lib/api/client";

const client = createSupplyChainClient("http://127.0.0.1:8000");
const result = await client.POST("/runs", {
  body: { preset: "base_4dc", seed: 808, replications: 1 },
});
if (result.error || !result.data) throw new Error("Run request failed");
const runId = result.data.run_id;
```

The frontend application and visualization components begin in M9. M8 supplies the
typed transport, not a frontend shell. CORS currently permits the two configured
local development origins. Reproduce saved API evidence with:

```powershell
.\.venv\Scripts\python.exe -m scm.api_validate --output docs/evidence/m8
```

The ASGI acceptance client waits for background tasks before returning control;
the separate live Uvicorn smoke check verifies an actual 202 response followed by
running/complete status and a request through the TypeScript client. See
[validation](validation.md) and the [response evidence](evidence/m8/results.json).
