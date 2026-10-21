# Implementation Plan: Multi-Echelon Supply Chain Network and Inventory Policy Study

*Build plan for a coding agent (Codex): simulation engine, experiments, API and control-tower dashboard · v1.0 · October 2026*

## 1. How to use this plan with Codex

- **Contract first.** Milestone M0 produces JSON Schemas and sample fixtures in `contracts/`. Engine and frontend are then built in parallel against the same contract.
- **One milestone per task.** Give Codex one milestone plus the sections it references. Aim for diffs under about 600 changed lines.
- **Tests are the gate.** Every milestone ends with `make check` (lint, types, tests) green plus that milestone's acceptance checks.
- **No invented numbers.** Parameters live in YAML with a source or ASSUMPTION note. Report figures come only from experiment outputs.
- **Operations vocabulary everywhere.** Package names, UI labels and README say echelon, DC, days of cover, OTIF, never graph-ML terms.

Prompt template for every task:

```
Read AGENTS.md and docs/plan.md sections [list]. Implement milestone Mn only.
Write tests first. Do not edit contracts/ without explaining why.
Finish by running `make check` and summarising: what passes, what is deferred, assumptions made.
```

## 2. Tech stack and why

| Layer | Choice | Reason |
| --- | --- | --- |
| Simulation | Python 3.12, numpy, scipy, pandas | Vectorised daily-step engine; scipy for the normal loss function G(z) and root-finding |
| Config and schemas | pydantic v2 + YAML | Validated scenarios; JSON Schema auto-generated for the contract |
| Storage and query | Parquet (pyarrow) + DuckDB | Columnar results; SQL behind the query bar with no database server |
| Experiments | joblib process pool, Typer CLI | One command per experiment, parallel replications |
| API | FastAPI + uvicorn | Thin compute/read layer; OpenAPI generates the TypeScript client |
| Frontend | Vite, React 18, TypeScript | Fast dev loop, static-deployable |
| UI kit | Tailwind CSS + shadcn/ui (Radix) | Minimal, accessible, easy monochrome theming |
| Network view | Cytoscape.js (react-cytoscapejs) | Data-mapped styling (shape, colour, width), preset layouts, handles hundreds of nodes |
| Charts | Apache ECharts (echarts-for-react) with a custom minimal theme | One library for dense time series, markLines (ROP, Q), heatmaps, stacked bars, CI bands, tornado |
| State | Zustand (UI), TanStack Query (server), URL params | Shareable deep links to a node, day and scenario |
| Maths display | KaTeX | Formulas on the Methodology page |
| Type | Inter + IBM Plex Mono | Tabular numerals for KPIs |
| Quality | pytest, hypothesis, ruff, mypy, Vitest, Playwright, GitHub Actions | Invariant tests and UI smoke tests |
| Hosting | Static demo (Vercel/Netlify) from pre-baked results; live sandbox via `make dev` or one Docker image | Interviewers get a link; the sandbox needs compute |

**Engine choice.** A custom daily-step ('discrete-time') engine beats SimPy here: inventory review is naturally periodic, numpy vectorises across SKUs and nodes, and pre-drawn random streams give common random numbers cheaply. State this openly in the report.

## 3. Repository layout

```
supply-chain-study/
  AGENTS.md  README.md  Makefile
  contracts/        JSON Schemas, OpenAPI, fixtures (source of truth)
  configs/          network, SKU master, scenario presets (YAML)
  docs/             plan.md, assumptions.md, parameters.md, validation.md, report/
  engine/src/scm/
    analytics/      eoq, epq, discounts, safety_stock, newsvendor, pooling
    config/         pydantic models, loader
    network/        geography, facility_location, builder
    demand/         generator, classify (ABC-XYZ)
    forecast/       moving_average, exp_smoothing, error_metrics
    policies/       qr, ss, rs, order_up_to
    sim/            engine, state, costs, disruptions
    metrics/        kpis, bullwhip, resilience
    experiments/    runner, exp01..exp06, stats
    io/  cli.py
  api/app/          main, routes, services, query
  web/src/          app, components, features, charts, lib, styles
  web/e2e/          Playwright tests
  data/             gitignored: runs/, results/
```

## 4. Domain model and defaults

**Setting:** FMCG packaged foods on Indian lanes, costs in INR. Panels relate to it and parameters are easy to justify. (Auto spares is a fine alternative.)

- **Suppliers (4):** reliable-expensive, cheap-slow, cheap-variable, local-small. Attributes: price per SKU, lead time mean and CV (gamma), MOQ, daily capacity, delay probability.
- **DC candidates (8 metro sites):** Delhi NCR, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Ahmedabad, Pune. Attributes: capacity, annual fixed cost, holding cost % (20–25%), handling cost per unit.
- **Retailers (24)** clustered by region, plus **B2B buyers (4)** with lumpy contract orders, a contractual service level and a shortage penalty.
- **SKUs (20):** about 6 A, 8 B, 6 C, spanning X, Y and Z variability.
- **Edges:** distance (haversine × 1.3 circuity), lead time mean and CV, cost per unit-km, mode FTL (trip capacity, cost per trip) or LTL (per-unit-km premium).
- **Network sizing sweep:** DC sets for k = 1, 2, 4, 8 chosen by demand-weighted k-median (greedy plus swap improvement); each retailer is assigned to its nearest open DC.

Scenario YAML skeleton:

```
scenario: base_4dc
horizon_days: 365
warmup_days: 90
replications: 30
network: {dc_count: 4, suppliers: [S1, S2, S3, S4]}
demand: {cv_scale: 1.0, regional_rho: 0.3, seasonality: monthly_index_v1}
policy: {default: QR, target_csl: 0.95, segmentation: abc_xyz_v1}
bullwhip: {signal_processing: true, batching: true, price: false, rationing: false, pos_sharing: false}
disruptions: []
```

Every cost parameter goes in `docs/parameters.md` as a table: parameter, value, unit, source or ASSUMPTION, sensitivity tested (Y/N).

## 5. Engine specification

### 5.1 Time and randomness

Daily buckets; 90-day warm-up plus 365 measured days; 30 replications. Use `numpy.random.SeedSequence.spawn` for separate streams (demand, lead time, supplier delay, B2B orders). Pre-draw demand arrays (T × SKU × demand node) per replication seed so they are identical across scenarios. Draw lead times from a pre-drawn uniform matrix indexed by (edge, order day) so changing a scenario does not shift later draws. Together these are common random numbers.

### 5.2 Demand

`D = max(0, base × (1 + trend×t) × season_t + sigma × (sqrt(rho)×Z_region + sqrt(1-rho)×Z_own))`. The shared regional factor gives a tunable correlation rho. Use normal for A/B items, gamma or negative binomial for slow movers, and a compound process (arrival rate, lognormal size) for B2B buyers.

### 5.3 Daily loop (order matters)

1. **Receive** shipments arriving today.
2. **Demand** at retailers and buyers; fill from on-hand; shortfall is backordered (default) or lost (flag).
3. **Forecast** update at each ordering node from the demand it observes (DCs see retailer orders unless POS sharing is on).
4. **Review and order** on review days: inventory position = on-hand + on-order − backorders; apply the policy; round up to MOQ and pack size.
5. **Fulfil upstream orders:** allocate available stock (FIFO, optional proportional rationing), sample lead time, consolidate to FTL when size justifies it, else LTL; suppliers apply capacity, MOQ and outage state.
6. **Accrue costs and log** state arrays.

Invariants asserted in tests: per node-SKU inventory balance, no negative on-hand, shipped = received + in transit, cost components sum to total.

### 5.4 Policies and formulas

- (Q,R), (s,S), periodic (R,S) and order-up-to with moving-average or exponential-smoothing forecasts.
- `Q* = sqrt(2DS/H)`; EPQ `sqrt(2DS/(H(1-d/p)))`; all-units quantity discount; newsvendor critical ratio.
- `sigma_L = sqrt(L×sigma_d² + d²×sigma_LT²)`; `ROP = dL + z×sigma_L`; CSL = Phi(z).
- Fill rate `1 − sigma_L×G(z)/Q`; solve for z with brentq when targeting fill rate.
- Pooled safety stock `z × sqrt(L) × sqrt(sum_ij rho_ij sigma_i sigma_j)`.

### 5.5 Forecasting and segmentation

Moving average, simple and Holt exponential smoothing only. Report MAD, MAPE (guard zeros; also wMAPE), bias and tracking signal. ABC by annual consumption value (80/15/5), XYZ by demand CV (below 0.5, 0.5 to 1, above 1); nine-cell policy table (e.g. AX: (Q,R) at 98%; CZ: (s,S) at low service or make-to-order).

### 5.6 Bullwhip module

Four stages: customer demand → retailer orders → DC orders → supplier orders. `BWE_k = Var(orders_k)/Var(customer demand)` on weekly-aggregated, post-warm-up series. Toggle each Lee-Padmanabhan-Whang cause: signal processing (order-up-to with forecast; a known-demand control run gives about 1), batching (order multiples, weekly cycle), price (promo calendar with forward buying), rationing (inflate orders when fill rate drops below a threshold). Countermeasures: POS sharing, order smoothing (order = forecast + alpha × (target − IP)), lead-time reduction, VMI, EDLP. Plot against the Chen et al. bound `1 + 2L/p + 2L²/p²` for MA(p).

### 5.7 Disruptions and resilience

Event list: `{type, target, start_day, duration, magnitude}` with types supplier\_outage, lead\_time\_multiplier, demand\_shock, capacity\_cut, moq\_change, price\_promo. Metrics: **time-to-survive** (days until first stockout at affected downstream nodes; analytic check = on-hand ÷ demand), **time-to-recover** (days from event start until 7-day rolling fill rate ≥ baseline − 1 pt), **disruption cost** (paired difference vs the undisturbed run on the same seeds) and lost-sales units. Mitigations: safety stock buffer, dual sourcing, lateral transshipment, expedite.

### 5.8 KPIs (node and network level)

Fill rate (units shipped from stock on time ÷ units demanded); cycle service level (share of replenishment cycles without stockout); stockout days; inventory turns (COGS ÷ average inventory value); days of inventory (365 ÷ turns); cash-to-cash (DIO + DSO − DPO, with DSO and DPO as assumptions); OTIF; total landed cost (purchase, inbound and outbound freight, holding, ordering, DC fixed, shortage penalty); cost-to-serve per node; bullwhip ratio.

### 5.9 Performance budget

One replication (455 days, 20 SKUs, 8 DCs, 24 retailers) under 3 s; loop over days only, vectorise over SKUs and nodes; 30 replications under 30 s on 8 cores.

## 6. Verification and validation

| ID | Check | Pass criterion |
| --- | --- | --- |
| V1 | Deterministic limit (sigma = 0) | Annual cost within 0.5% of EOQ total cost; zero stockouts |
| V2 | Q sweep with stochastic demand | Cost-minimising Q within ±10% of Q\*; flat bottom visible |
| V3 | Safety stock | Simulated CSL within 1.5 pts of target, including variable lead time via sigma\_L |
| V4 | Fill rate | Simulated vs formula within 1 pt |
| V5 | Risk pooling | Safety-stock ratio ≈ 1/sqrt(n) at rho = 0, ≈ 1 at rho = 1, matches the formula in between |
| V6 | Little's law | Average inventory = throughput × dwell time within 2% |
| V7 | Bullwhip | Single-stage BWE at or above the Chen bound and close to it; known-demand control ≈ 1 |
| V8 | Reproducibility and CRN | Same seed gives identical output; paired variance below unpaired (report the reduction) |

Results go to `docs/validation.md` and the Methodology page. Justify warm-up length with a Welch moving-average plot.

## 7. Experiments

Runner: a YAML spec expands to a scenario grid, runs replications in parallel and writes Parquet plus `manifest.json` (config hash, git SHA, package versions). `stats.py` provides means, 95% t-intervals and paired-difference intervals.

| # | Factors | Outputs |
| --- | --- | --- |
| E1 | V1–V4 sweeps | Validation tables and plots |
| E2 | Target CSL 90 to 99.5% × SKU class | Inventory cost vs achieved CSL and fill rate; marginal cost per service point |
| E3 | DCs {1,2,4,8} × demand CV {0.2,0.4,0.8} × rho {0,0.3,0.6,0.9} × outbound freight ×{0.5,1,2} × inbound lead time {3,7,14} days | U-shaped landed-cost curve; break-even heat map (freight × rho → best k). Screen with 10 replications, confirm near break-even with 30 |
| E4 | 4 causes on/off (16 cells) × information sharing × lead time | BWE per echelon; mitigation effect |
| E5 | Uniform vs ABC-XYZ policies | Inventory at equal blended fill rate (calibrate service targets by search so fill rates match) |
| E6 | Disruption types × mitigations; ±20% one-at-a-time parameter sensitivity | TTS, TTR, disruption cost; tornado chart |

## 8. API and query layer

Runs are keyed by config hash and cached under `data/runs/{hash}`. Payloads are columnar arrays, not arrays of objects. The node-health matrix (nodes × days) is sent once so the time scrubber runs client-side without further requests.

| Endpoint | Purpose |
| --- | --- |
| GET /scenarios | Preset list |
| POST /runs | Config overrides, seed, replications → run id (synchronous for 1 replication, background otherwise) |
| GET /runs/{id}/network | Nodes, edges, static attributes, aggregate KPIs |
| GET /runs/{id}/health | Node × day matrix (days of cover, stockout flag) |
| GET /runs/{id}/timeseries | node, sku, metrics, date range |
| GET /runs/{id}/kpis | Network and node KPIs with CIs |
| POST /runs/{id}/query | Filter spec → matching nodes and rows |
| GET /compare?a=&b= | Paired A/B KPI deltas and cost stack |
| GET /experiments/{id} | Pre-computed experiment results |

**Query bar.** Filter chips plus a rule-based parser (no LLM) turn phrases such as `warehouses with days of cover < 7` or `retailers with fill rate < 95%` into a JSON filter spec. The API translates it to parameterised DuckDB SQL with whitelisted columns and operators. Matches highlight on the network and fill a results table.

## 9. Frontend specification

### 9.1 Design system

- Light theme by default, optional dark. Zinc neutral scale, hairline 1 px borders, no gradients, minimal shadow (drawers only), 8 px grid.
- One accent (steel blue #2B5C8A) plus one alert colour (burnt orange #C2410C) reserved for stockouts.
- Health = days of cover on a single-hue lightness ramp, with a glyph for stockout risk (colour-blind safe).
- Node shapes: supplier diamond, DC square, retailer circle, B2B buyer hexagon. Edge width ∝ sqrt(flow).
- Inter for UI, IBM Plex Mono with tabular numerals for KPIs. Direct labels over legends; scenario A = ink, scenario B = accent.

### 9.2 Layout

Slim left nav; top bar (scenario picker, Run, A/B toggle, theme); main canvas; right inspector drawer; docked time scrubber (Control Tower only).

### 9.3 Views

1. **Control Tower:** KPI strip with sparklines and deltas, network canvas, node inspector, scrubber with play and speed, query bar.
2. **Scenario Lab:** grouped sliders (demand shock, supplier outage, lead-time extension, capacity cut, MOQ, promotion), presets such as 1 DC vs 4 DC, side-by-side A/B with paired deltas and cost stack.
3. **Network Design:** landed-cost U-curve by component, break-even heat map, DC placement view (lat/long layout toggle).
4. **Bullwhip Lab:** cause toggles, BWE bars by echelon with theory line, orders-vs-demand small multiples.
5. **Inventory Lab:** interactive EOQ cost curve, sawtooth with simulated overlay, service-vs-cost curve, CSL vs fill rate.
6. **Resilience:** disruption timeline with shaded outage, TTS and TTR cards, tornado.
7. **Methodology:** KaTeX formulas, assumptions table, V&V results, report link.

### 9.4 Network canvas notes

Preset layout in three columns (suppliers, DCs, retailers and buyers) ordered by region to limit edge crossings; per-day updates inside `cy.batch()`; hover highlights the upstream path; click opens the inspector; query matches keep full opacity while others drop to 0.15. Inspector charts: on-hand, on-order and backorders with ROP and Q markLines, plus service, orders and cost cards.

### 9.5 Chart catalogue (all ECharts)

Inventory position (line/area + markLine); EOQ cost curve (line + markPoint at Q\*); sawtooth (line); cost stack (stacked bar); landed cost vs DCs (bar + line); break-even (heatmap); BWE by echelon (bar + markLine); service-cost curve (line + 95% CI band); tornado (diverging bar); disruption (line + markArea); turns by node (sorted horizontal bar); KPI sparklines. Every chart exports PNG and CSV; time-series charts share linked axis pointers with the scrubber.

### 9.6 Quality bar

Smooth scrubbing at 100 nodes; lazy-loaded views; keyboard navigable; desktop-first from 1280 px; Playwright smoke tests with screenshot baselines; Lighthouse ≥ 90 on the static demo.

## 10. Milestones (one Codex task each)

| M | Deliverable | Acceptance |
| --- | --- | --- |
| M0 | Scaffold, Makefile, CI, AGENTS.md, `contracts/` schemas and fixtures | `make check` green; fixtures validate against schemas |
| M1 | `analytics/` formulas | Unit tests vs textbook worked examples; property test that Q\* minimises cost |
| M2 | Demand generator, single-node (Q,R) engine, cost accrual, CRN | V1–V4, V6, V8 pass |
| M3 | Config loader, geography, k-median, multi-echelon engine, all policies, FTL/LTL | Invariants pass; V5 passes; performance budget met |
| M4 | Forecasting, error metrics, ABC-XYZ, segmentation policy map | Error metrics tested; E5 dry run |
| M5 | Bullwhip module with four causes and countermeasures | V7 passes; each cause toggle moves BWE in the expected direction |
| M6 | Disruption engine and resilience metrics | TTS matches analytic check; TTR and cost reproducible |
| M7 | Experiment runner, E1–E6, manifests, static figures | Re-running an experiment reproduces the same Parquet hash |
| M8 | API, DuckDB query layer, OpenAPI → TS client | API tests; contract diff clean; query spec fuzz-tested |
| M9 | Frontend shell, design system, Control Tower (fixtures first, then live API) | Playwright smoke; scrubber smooth with 100 nodes |
| M10 | Scenario Lab, Network Design, Bullwhip, Inventory, Resilience, Methodology views | Each view loads with fixtures; A/B delta matches the API |
| M11 | Static demo export, Docker image, performance and accessibility pass | Demo deployed; Lighthouse ≥ 90 |
| M12 | README case study, 6–8 page report, one-page executive summary, resume bullets filled, interview Q&A sheet | Every number traceable to a manifest |

## 11. Parallel tracks, risks, descoping

- **Parallel:** engine (M1–M7); frontend on fixtures (M9–M10, after M0); API (after M3).
- **Risks:** engine too slow (profile, vectorise); parameter credibility (source table, sensitivity runs); agent drift (schema-diff check in CI, small tasks); scope creep.
- **Descope order:** plant and BOM, lateral transshipment, geographic layout, dark mode, DuckDB-WASM static queries.

## 12. Eight-week schedule

Weeks 1–2: M0–M2. Weeks 3–4: M3–M4, E2–E3. Week 5: M5–M6, E4–E6. Week 6: M7–M8. Week 7: M9–M10. Week 8: M11–M12.

## Appendix A: AGENTS.md (paste at repo root)

```
# Project rules
- This is an operations study, not an ML project. Use supply-chain vocabulary in code, UI and docs.
- Engine: Python 3.12, numpy vectorised over SKU and node; loop over days only. No SimPy.
- All randomness via SeedSequence streams; never call the global np.random.
- Scenario parameters live in configs/*.yaml; every value has a source or ASSUMPTION note in docs/parameters.md.
- contracts/ is the source of truth; schema changes need an explicit note in the PR.
- Frontend: React + TS strict, Tailwind + shadcn, Cytoscape for the network, ECharts for all charts. No other chart libraries.
- Colours: zinc neutrals, one accent, orange only for stockouts.
- Definition of done: make check passes, tests added, docs updated, no TODOs without an issue.
```
