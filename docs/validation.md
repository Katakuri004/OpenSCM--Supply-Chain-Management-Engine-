# Validation status

M0 checks: fixture validation against Draft 2020-12 JSON Schemas and Pydantic models;
scenario/YAML parity; invalid parameter rejection; network reference validation;
matrix/column alignment; query whitelist; schema drift; lint, formatting and types.

Local result (12 October 2026, Python 3.12.10 on Windows): `python -m scm.check`
passed Ruff lint, format checks, strict mypy, schema drift checks and all 30 tests.
`pip check` also passed. GNU Make is unavailable on this machine; the Python
entrypoint is exactly what `make check` invokes. The GitHub workflow has been
configured but has not run remotely. Tests use synthetic fixtures only.
This was the M0 baseline; M2 numerical evidence is now recorded below.

M1 local result (12 October 2026): `python -m scm.check` passed lint, formatting,
strict mypy, unchanged contract schemas and all 68 tests (30 M0 + 38 M1).
`pip check` passed. Tests were written and observed failing on the absent analytics
package before implementation. The EOQ property test exercises 150 deterministic
Hypothesis examples across demand, setup cost, holding cost and order multipliers.

M1 coverage includes EOQ/EPQ arithmetic, MIT newsvendor examples, an independent
discount quantity sweep, normal loss reference values, fill-rate inversion,
pooling across correlations, zero demand/variance and invalid-input rejection.
See [analytics](analytics.md) for provenance and limits. NumPy, SciPy and Hypothesis
were added to the dependency lock; SciPy's untyped imports are narrowly exempted
from missing-stub errors, while project code remains checked in strict mode.

## M2: simulation acceptance

Local result (12 October 2026, Python 3.12.10): all 95 tests pass, including the
M2 acceptance cases. Ruff lint/formatting, strict mypy, schema drift and `pip check`
also pass. The new engine and acceptance tests were observed failing on the absent
modules before implementation. Contracts remain unchanged.

Numbers below come from [saved results](evidence/m2/results.json), with
[configuration/source/output hashes](evidence/m2/manifest.json). The fixed seed
is 20261012, with 30 independent replications for stochastic cases. Cost cases use
10000 measured days; service cases use 30000. Both discard 1000 warm-up days.
The service cases have a synthetic 100-day mean lead time, daily mean/std 10/4,
and variable-lead CV 0.05; these are numerical benchmarks, not operating claims.

| Check | Observed | Reference / gate | Status |
| --- | --- | --- | --- |
| V1 deterministic annual total cost | INR 11680.00 | INR 11680.00 ± 0.5% | Pass |
| V1 deterministic stockout days | 0 | 0 | Pass |
| V2 minimum-cost order quantity | 100 units | EOQ 100 ± 10% | Pass |
| V3 fixed-lead CSL | 95.4348% | 95% ± 1.5 percentage points | Pass |
| V3 variable-lead CSL | 94.6220% | 95% ± 1.5 percentage points | Pass |
| V4 fill rate | 95.3439% | 95% ± 1 percentage point | Pass |
| V6 average inventory | 50 units | 10 units/day × 5 days, within 2% | Pass |
| V8 repeat-run maximum cost difference | 0 | Identical output | Pass |
| V8 variance of annual cost differences | 27.7486 paired vs 1248.7203 unpaired | Paired < unpaired | Pass |

V8 variance reduction is 97.7784% in this comparison; it is not a universal CRN
guarantee. Each V3 case includes 8981 complete receipt-to-receipt cycles. The
variable gamma leads round to a realized mean 100.5015 days and SD 5.0142 days.
V2 cost minimization isolates ordering and holding costs; V1 includes purchases.

![Cost sweep and warm-up diagnostic](evidence/m2/validation.png)

The [sweep CSV](evidence/m2/q_sweep.csv) retains costs by replication, and plotted
error bars are 95% t intervals. The Welch trace is the replication-average inventory
in the fill-rate case, smoothed over 201 days. The initial transient is well before
the 1000-day benchmark cutoff. Its [raw observations](evidence/m2/welch.csv) are saved.
The plot was rendered and visually checked for labels, clipping, scales and data shape.

Engine tests also cover on-hand/backlog/pipeline balance, order-day lead-time lookup,
late arrivals beyond the horizon, cost decomposition, old-backlog priority, lost
sales, zero demand, partial cycles, demand moments/correlation, invalid inputs, and
stable replication seeds. See [simulation conventions](simulation.md).

At M2, simulated V5 (pooling), V7 (bullwhip), network performance, and the base network's
90-day warm-up remained for later milestones. Shorter lead times or other demand
regimes may violate normal continuous-review approximations; only the stated
benchmark cases are validated here. Remote CI has not run; the local Windows
entrypoint is the same one invoked by `make check`.

## M3: network acceptance

Local result (21 October 2026, Windows, Python 3.12.10): `python -m scm.check`
passes lint, formatting, strict mypy, unchanged contract schemas and 119 tests.
Network tests were written before implementation; the initial run failed on the
missing configuration package. M2's engine and numerical regressions remain intact.

The [M3 results](evidence/m3/results.json) and [manifest](evidence/m3/manifest.json)
record the raw observations, seeds, runtime versions, machine details and
configuration/source/output hashes. V5 draws 30000 independent four-day protection
periods across four sites, with normal daily mean 100 and standard deviation 10.
Safety stock is the empirical 95th percentile minus known protection-period mean.
The pooled/separate ratio is compared with sqrt((1 + 3 rho)/4); the acceptance
margin is 0.03 absolute ratio units.

| V5 correlation | Observed ratio | Formula ratio | Status |
| --- | --- | --- | --- |
| 0 | 0.498092 | 0.500000 | Pass |
| 0.3 | 0.684802 | 0.689202 | Pass |
| 0.6 | 0.833945 | 0.836660 | Pass |
| 1 | 1.000000 | 1.000000 | Pass |

V5 validates risk pooling in protection-demand tails. It does not claim equivalent
service or savings when DC capacity, replenishment batching and freight are active.

| Performance check | Observed | Gate | Status |
| --- | --- | --- | --- |
| One replication | 0.3866 s | <3 s | Pass |
| 30 replications, eight worker processes | 5.3739 s | <30 s | Pass |
| Serial versus worker cost/fill for the same seed | Identical | Exact reproducibility | Pass |

Each replication includes 455 days, 20 SKUs, eight DCs, 24 retailers and four B2B
buyers. Timing includes loading configuration, selecting sites, generating inputs,
simulating and computing summaries. Parallel timing includes process startup and
shutdown; workers each use one BLAS thread. These are local measurements, not a
guarantee on every eight-core machine. Cost and fill values in the evidence are
synthetic benchmark outputs, not operating recommendations.

Tests cover all four DC counts/policies, geographic distances, weighted selection,
MOQ/pack rounding, FIFO against an independent chronological allocator, constrained
stock and shared source capacity, partial shipments retaining original order-day
transit draws, late shipments, lost sales, exact hand-calculated cost attribution,
daily freight consolidation across SKUs, common random numbers across networks,
and inventory/pipeline/backlog balances including a full 455-day run.

M4 forecasting and segmentation are next. V7 remains M5 work, disruptions M6,
and general experiment sweeps M7. Network service calibration, operating-parameter
sensitivities and the 90-day network warm-up justification remain unverified.
Remote CI has not run; no live API, frontend or deployment is part of M3.

## M4: forecasting and segmented replenishment

Local result (21 October 2026, Python 3.12.10): `python -m scm.check` passes lint,
formatting, strict mypy, unchanged schemas and all 138 tests. Tests for forecasting,
planning integration and the E5 runner were first observed failing on absent modules.
The new checks cover hand-calculated MA/SES/Holt forecasts; MAD, MAPE, wMAPE,
bias and tracking signal; zero-demand/zero-denominator behavior; ABC threshold
crossers and XYZ boundaries; every policy-map cell; B2B target floors; no future
observation leakage; DC order signals; repeatability; and inventory/pipeline balances.
Constant-demand forecast targets agree with M3 for all four inventory policies.

The [E5 results](evidence/m4/results.json) and [manifest](evidence/m4/manifest.json)
retain configurations, source/output hashes, all calibration candidates, independent
training/calibration/evaluation seeds, and forecast diagnostics. Earlier M2/M3
manifests describe their historical source snapshots; the M4 manifest describes
the implementation at the M4 milestone.

Classification uses 180 separate historical days. The synthetic base case yields
8 AX, 6 BX and 6 CX SKUs: network aggregation reduces CV below 0.5 for every SKU.
The nine-cell table is additionally tested with a fixture spanning all cells; the
base experiment does not claim to exercise every cell. Class membership is frozen
before calibration and evaluation.

Two calibration replications give uniform mean blended fill rate 99.0531%.
The selected segmented z offset is 0.0; its calibration fill rate is 98.8903%,
a 0.1628-percentage-point gap. Both policies are then evaluated on two new paired
seeds, each with 90 warm-up and 365 measured days. The search does not use these
evaluation outcomes.

| Held-out mean | Uniform | Segmented | Segmented − uniform |
| --- | --- | --- | --- |
| Blended unit fill rate | 98.9815% | 98.7606% | −0.2210 percentage points |
| Average on-hand inventory value | INR 11167770.17 | INR 12002000.84 | INR +834230.67 |

Service matching passes the configured 0.5-percentage-point tolerance on calibration
and held-out runs. Inventory increases in this case; this is not an inventory-saving
claim. Two replications and approximate service matching are insufficient for a
general comparison. M7 still needs confidence intervals, broader demand regimes and
service/parameter calibration. Raw cost and forecast-error summaries remain in the
evidence; aggregate forecast errors can conceal opposing SKU errors.

The M3 acceptance runner was also rerun against the M4 engine because mixed-policy
ordering changes the daily loop. Its [regression results](evidence/m4/network_regression/results.json)
and [manifest](evidence/m4/network_regression/manifest.json) record V5 passing,
0.5089 s for one 455-day/eight-DC replication and 4.6465 s for 30 replications on
eight worker processes, within the original 3 s / 30 s limits. This benchmark
uses the known-demand control; the E5 evidence exercises forecast-driven policies.

M5 bullwhip causes, countermeasures and V7 are next. The network warm-up and service
approximations remain uncalibrated, and remote CI has not run. No API, frontend,
disruption behavior or general-purpose experiment runner was added in M4.

## M5: bullwhip causes and countermeasures

Local result (21 October 2026, Python 3.12.10): `python -m scm.check` passes lint,
formatting, strict mypy, unchanged consumer schemas and all **146 tests**. New tests
were written and observed failing before their implementations. They cover weekly
aggregation and undefined variance, order adjustments, promotion/EDLP/VMI behavior,
POS signals, future-observation isolation, stock/pipeline conservation, lead reduction,
discounted purchases, required forecast configuration and the exact Chen order identity.

The [M5 results](evidence/m5/results.json), [manifest](evidence/m5/manifest.json),
[daily network series](evidence/m5/daily_series.csv) and
[figure](evidence/m5/bullwhip.png) record the controlled experiment. Manifests preserve
configuration and engine source hashes, output hashes, package versions and the
seed root; per-run seeds are in the results. Earlier evidence remains historical.
The working directory has no Git commit, recorded as null in the manifest.

V7 uses IID Gaussian daily demand, five-day constant lead, z=1, 128 warm-up days,
16384 measured days and 64 independent replications. The observed ratio is the
mean replication ratio. The known-demand reference is 1.000022 for all windows.

| MA window | Chen daily lower bound | Observed daily BWE | Relative excess | Gate |
| --- | --- | --- | --- | --- |
| 7 days | 3.448980 | 3.617109 | 4.8748% | Pass |
| 14 days | 1.969388 | 2.002950 | 1.7042% | Pass |
| 28 days | 1.420918 | 1.428051 | 0.5020% | Pass |

All observed ratios lie between the bound and the configured 5% excess tolerance;
the fixed-target control meets its 0.005 tolerance around one. The 7-day result is
close to the configured limit. These finite-sample checks do not prove the bound
for arbitrary input parameters. The separate z=0 identity test validates the exact
lagged-demand algebra independently of the Monte Carlo tolerance.

Three paired network seeds each run 455 days, with 90 warm-up and 52 complete
measured weeks. Each case receives identical physical demand and original transit
draws within its seed. Values below are means of weekly variance ratios, not ratios
of averaged series. Supplier orders received equal the DC-order column.

| Case | Customer-order BWE | DC-order BWE | Comparison baseline |
| --- | --- | --- | --- |
| All causes off | 1.000000 | 1.000000 | — |
| Signal processing | 1.699984 | 9.147272 | All causes off |
| Batching | 1.037034 | 1.807609 | All causes off |
| Price promotions | 1338.093666 | 5191.607225 | All causes off |
| Rationing gaming | 1.000792 | 1.065875 | All causes off |
| POS sharing | 1.699984 | 6.214753 | Signal processing |
| Order smoothing | 1.289959 | 4.799015 | Signal processing |
| Lead reduction | 1.562799 | 5.497816 | Signal processing |
| Signal + batching + rationing | 3.305241 | 53.995013 | VMI comparison baseline |
| VMI | 1.699984 | 6.214753 | Signal + batching + rationing |
| EDLP | 1.000000 | 1.000000 | Price promotions |

All four causes increase DC BWE in **every paired replication**; all five
countermeasures decrease it against their named baseline in every pair. These nine
direction gates pass. The very large promotion ratio comes from synchronized
14-day forward-buy targets across the synthetic network, not observed commercial
behavior. Rationing's small effect is capacity-dependent. This is an implementation
acceptance run, not the full E4 factorial experiment or a calibrated effect estimate.
The daily Chen bound must not be overlaid as a lower bound on these weekly ratios.

The [M3 regression results](evidence/m5/network_regression/results.json) and
[manifest](evidence/m5/network_regression/manifest.json) also pass V5 and the original
performance budgets: **0.6641 s** for one 455-day/eight-DC replication and **7.8648 s**
for 30 replications on eight worker processes (limits 3 s and 30 s). The full test
suite ran concurrently, so these are local acceptance timings, not isolated speed
comparisons with M4. The benchmark uses the legacy known-demand control; M5's
separate experiment exercises the new mechanisms.

M6 disruptions and resilience metrics are next. M7 retains the full E4 factorial
design, confidence intervals, Parquet reproducibility, and network service/warm-up
calibration. Remote CI, API, frontend and deployment have not been run or added here.

## M6: disruption engine and resilience metrics

Local result (21 October 2026, Python 3.12.10): `python -m scm.check` passes all
**165 tests**, lint, formatting, strict mypy and schema drift checks. Tests were
written and observed failing before implementation. Coverage includes all six event
types, magnitude/target validation, overlapping calendars, exclusive end dates,
supplier SKU scope, order-date transit on queued orders, MOQ enforcement, discounted
purchases, unchanged input arrays, inventory/pipeline balances, lost sales, forecast
integration, delayed service breaches, censored recovery and unaffected-customer exclusion.
The new disruption scenario fixture passes both JSON Schema and Pydantic validation.

The [M6 results](evidence/m6/results.json), [daily series](evidence/m6/daily_series.csv),
[figure](evidence/m6/disruptions.png) and [manifest](evidence/m6/manifest.json) contain
the numerical evidence. The manifest records source/config/schema/output hashes,
versions and validation settings; results record replication seeds. Earlier milestone
manifests describe historical source snapshots. No Git commit is available locally.

The network-engine survival check gives **2.5 days**, exactly matching initial
stock 25 / constant daily demand 10 under a complete downstream supply interruption.
Fractional depletion uses the engine's uniform-within-day consumption convention.

Each network event starts on day 120 and lasts 21 days. Two independent paired seeds
run the same 455-day horizon. Each disturbed run is repeated, and all twelve cases
produce **identical service histories, cost histories, TTS and TTR** on repetition.

| Event | TTR, seed 4219232553 | TTR, seed 3353068343 | Paired cost INR, first seed | Paired cost INR, second seed |
| --- | --- | --- | --- | --- |
| Supplier outage | 149 days | 167 days | +1936394.06 | +2076895.11 |
| Lead-time multiplier | 32 days | 31 days | +12491.54 | +15970.35 |
| Demand shock | 28 days | 28 days | +478553.86 | +491214.33 |
| Capacity cut | 0 days | 0 days | 0.00 | 0.00 |
| MOQ change | 0 days | 0 days | 0.00 | 0.00 |
| Price promotion | 0 days | 0 days | −452928.00 | −447852.00 |

Zero TTR means no rolling service breach relative to the paired baseline within
the one-percentage-point tolerance. It does not mean perfect service. The capacity
cut and MOQ setting are nonbinding in this regime; binding cases are unit-tested.
The price promotion changes purchase cost only and therefore has no service impact.
All network runs use backorders, so reported lost-sales units are zero; a separate
lost-sales test verifies positive event-related lost units.

First-stockout TTS in the stochastic network is often less than a day because some
affected SKU/customer shortages also occur in the baseline. For example, first-seed
S4-scoped TTS is 0.912988 days for the outage, lead event, MOQ event and discount.
This metric is the absolute first observed shortage after event start, not a causal
estimate of survival attributable only to the event. The isolated deterministic
case establishes the analytical acceptance check. Recovery is first rolling recovery;
later relapses and finite-horizon truncation remain possible.

The [network performance regression](evidence/m6/network_regression/results.json)
also passes V5 and the existing limits: **0.6291 s** for one 455-day/eight-DC run and
**7.4252 s** for 30 runs on eight worker processes, below 3 s and 30 s respectively.
These local benchmarks use the unchanged no-event path. The event runner separately
verifies the new path; no production performance guarantee is implied.

M7 is next: general experiment orchestration, complete E1–E6 sweeps, mitigation and
sensitivity studies, confidence intervals and reproducible Parquet outputs. M6 does
not implement dual sourcing, lateral transshipment or a dedicated expedite policy.
Operational calibration, remote CI, API, frontend and deployment remain unverified.

## M7: experiment grids, paired statistics and Parquet

Local result (22 October 2026, Python 3.12.10): `python -m scm.check` passes
**176 tests**, lint, formatting, strict mypy and generated-schema drift checks.
New tests were observed failing before implementation. They check Student t
intervals, seed-aligned paired differences, missing/nonfinite observations,
full-factorial cell counts, deterministic case IDs, near-break-even selection,
marginal service cost in percentage points, duplicate/empty designs, and exact
serial/parallel Parquet bytes. Mitigation tests check stock/pipeline conservation,
shared supplier capacity, actual backup purchase prices, stock buffers and expedite
charges. Inbound transit overrides rebuild policy targets; outbound freight factors
leave inbound charges and physical orders unchanged.

All six experiment grids completed with `configs/m7_validation.yaml`. It retains
all factor cells and uses reduced counts: two evaluation/screening replications,
three independent confirmation replications and five E5 calibration replications.
E1 retains the longer validated M2 design. The complete configured 30-replication
research campaign has not been run. Each experiment saves its row contract in
Parquet, estimates and paired intervals in JSON, a static figure, and a manifest
with actual source/config/schema/package/output provenance.

| Experiment | Saved records | Executed design | Evidence |
| --- | --- | --- | --- |
| E1 | 498 | V1–V4 results plus eight quantity settings, 30 replications | [Manifest](evidence/m7/E1/manifest.json), [summary](evidence/m7/E1/summary.json), [figure](evidence/m7/E1/summary.png) |
| E2 | 144 | 15 service/SKU cells × 2 runs; includes 24 marginal-cost observations | [Manifest](evidence/m7/E2/manifest.json), [summary](evidence/m7/E2/summary.json), [figure](evidence/m7/E2/summary.png) |
| E3 | 19371 | 432 screen cells × 2 runs; 299 near-break-even cells × 3 independent confirmation runs | [Manifest](evidence/m7/E3/manifest.json), [summary](evidence/m7/E3/summary.json), [figure](evidence/m7/E3/summary.png) |
| E4 | 1920 | All 64 cause/POS/lead cells × 2 runs | [Manifest](evidence/m7/E4/manifest.json), [summary](evidence/m7/E4/summary.json), [figure](evidence/m7/E4/summary.png) |
| E5 | 539 | Nine calibration candidates × 5 runs; two selected arms × 2 held-out runs | [Manifest](evidence/m7/E5/manifest.json), [summary](evidence/m7/E5/summary.json), [figure](evidence/m7/E5/summary.png) |
| E6 | 6912 | Six events × four mitigation settings × nine OAT settings × 2 runs | [Manifest](evidence/m7/E6/manifest.json), [summary](evidence/m7/E6/summary.json), [figure](evidence/m7/E6/summary.png) |

E2's finite-run achieved-CSL increments are nonpositive for 8 of 24 marginal-cost
observations; these are explicitly null. The small representative sample does not
establish smooth marginal costs or whole-class service performance.

The E3 screen slice with nominal CV 0.4, regional rho 0.3, outbound factor 1 and
base inbound lead 7 days gives mean measured landed costs INR 293911039.47,
291870600.69, 290528961.47 and 297840839.77 for 1, 2, 4 and 8 DCs respectively.
This is one exploratory slice, not a general recommendation for four DCs. Purchase
cost is included in the 5% near-break-even selection criterion, so many counts
qualify. Confirmation remains separate from screening in saved records and summaries.

E5 selects a segmented safety-factor offset of **0.5**. Its calibration mean fill
gap is +0.1868 percentage points and held-out gap is +0.1736 points, both within
the configured 0.5-point tolerance. Held-out mean fill is 99.0613% uniform versus
99.2349% segmented; mean inventory value is INR 11071156.07 versus 13291052.83.
Inventory increases in this case; approximate service matching and two held-out
replications do not establish an inventory-saving result.

For E6's first event (S4 outage), without an OAT adjustment, the measured means are:

| Mitigation | TTR | Paired disruption cost INR | Whole measured-run landed cost INR |
| --- | --- | --- | --- |
| None | 193 days | 2712363.75 | 295329926.60 |
| Stock buffer | 97.5 days | 286730.79 | 293539067.13 |
| Expedite | 179 days | 2197028.56 | 386864548.02 |
| Dual sourcing | 34 days | 151900.94 | 294931262.38 |

Each disruption-cost entry compares with its own mitigation-enabled undisturbed
baseline. Expediting reduces event-related loss here but raises total measured
cost substantially because its premium applies throughout the run. Buffer starting
inventory acquisition and backup reservation fees are excluded by the documented
accounting assumptions. These comparisons are synthetic implementation evidence,
not calibrated mitigation recommendations. Recovery estimates omit censored nulls
with missing counts retained; intervals are conditional on observed recovery.

The saved [reproduction check](evidence/m7/reproducibility.json) records exact E2
Parquet byte equality for one versus eight workers. The complete hash is
`48dfbd37aae1bc6e8fc2ca23639884201be76690a8bf9844ef4fe1e919b2adf9`.
The automated test independently repeats a smaller case across worker counts.
Reproduction is scoped to the dependency lock and source inputs recorded in manifests.
The [complete-grid repeat report](evidence/m7/all_experiments_reproduction.json)
also confirms that every E1–E6 Parquet hash is identical on a second pass after
the figure palette correction. Numerical code and experiment settings were unchanged
between these two passes. Every current manifest's input and output hashes were
verified against the saved files. Git treats evidence files as bytes to preserve
recorded checksums across newline conversion.

The [performance regression](evidence/m7/network_regression/results.json) and
[manifest](evidence/m7/network_regression/manifest.json) pass V5 and the original
limits: **0.5230 s** for one 455-day/eight-DC run and **6.3125 s** for 30 runs on
eight worker processes, below 3 s and 30 s respectively. This measures the standard
known-demand path; it does not establish a universal timing guarantee for all events.

The implementation uses the plan's PyArrow, joblib and Typer dependencies. DuckDB,
API response envelopes and the generated TypeScript client belong to M8. Lateral
transshipment is deferred under the plan's explicit descoping provision. Network
warm-up/service calibration, powered comparisons, remote CI and deployment remain
unverified. Earlier M2–M6 manifests continue to describe their historical source
snapshots rather than the current engine.

## M8: local API, DuckDB queries and TypeScript client

Local result (22 October 2026, Python 3.12.10 and Node.js 22.17.0):
`python -m scm.check` passes **197 tests**, Ruff lint/formatting, strict mypy,
JSON Schema and OpenAPI drift checks, generated TypeScript drift checks and strict
TypeScript compilation. The API and query tests were written before implementation;
the redundant-override cache regression was also observed failing before its fix.
Tests cover synchronous and background runs, cache identity, queue limits,
restart/failure/retry behavior, response alignment, time-series bounds, paired
comparisons, policy modes, experiment pagination/checksums and rejected input.
Hypothesis checks arbitrary query phrases and compares whitelisted DuckDB filters
against Python predicates across metrics, operators, node types, nulls and thresholds.
Compile-time client checks reject unknown paths, string seeds and SQL metric names.

The [acceptance settings](../configs/m8_validation.yaml) run the synthetic four-DC
preset and a two-DC alternative with two paired replications, 90 warm-up days and
365 measured days. All seven [API checks](evidence/m8/results.json) pass. The saved
health response has **36 nodes × 455 days**, including warm-up. The final-day query
matches 24 retailers and gives identical text/structured results. The E2 endpoint
reports 144 available records and returns the requested three-row page. Responses
and their source/output checksums are in the [M8 manifest](evidence/m8/manifest.json).

The four-DC [KPI response](evidence/m8/kpis.json) gives these replication means:

| Metric | Mean |
| --- | --- |
| Customer fill rate | 98.7417% |
| Receipt-cycle CSL | 94.3377% |
| Daily demand-line OTIF proxy | 99.2414% |
| Inventory turns | 26.9877 per year |
| Days of inventory / cash-to-cash | 13.5263 days |
| Days with any customer stockout/backlog | 357 of 365 |
| Measured landed cost | INR 293950397.45 |
| Weekly DC-order bullwhip ratio | 6.0133 |

These requests use the classic known-demand policies, not M5's order-up-to control.
The network stockout metric flags a day when any customer/SKU has a shortage or
backlog, so it can be high alongside a high volume-weighted fill rate. The
[paired comparison](evidence/m8/comparison.json) gives two DCs minus four DCs:
fill rate +0.1060 percentage points and landed cost +INR 1034344.45. All eight cost
component deltas sum to the total delta within floating-point tolerance. Saved
responses include 95% t intervals; two replications provide implementation evidence,
not a powered or calibrated network-design recommendation. Definitions and null
conventions are in [API methods](api.md).

A separate [live HTTP check](evidence/m8/live/results.json) starts Uvicorn, submits
the same two-replication request and receives **202 in 0.1061 seconds**, initially
queued, then observes running and complete. A request through the generated
TypeScript client receives 200 and the `base_4dc` catalog entry. This distinguishes
actual background response behavior from TestClient, which waits for background
tasks before returning. The [live manifest](evidence/m8/live/manifest.json) records
source hashes and the executed client JavaScript. The server was stopped afterward.

The final [network regression](evidence/m8/network_regression/results.json) and
[manifest](evidence/m8/network_regression/manifest.json) pass V5 and the original
performance limits: **0.6777 s** for one 455-day/eight-DC run and **8.1256 s** for
30 runs on eight worker processes, below 3 s and 30 s. Source-service logging is
opt-in for API measurements; the existing default simulation path is preserved.

The test run emits one upstream Starlette deprecation warning about its current
httpx-based TestClient; no test fails. Nine new public response/request schemas and
fixtures are documented in [contracts](../contracts/README.md). M9 begins the
frontend shell and Control Tower. Authentication, distributed jobs, deployed API,
remote CI results, full research replication counts and operational calibration
remain unverified. Prior milestone manifests retain their historical source scope.

## M9: Next.js Control Tower and browser validation

Local result (22 October 2026, Python 3.12.10, Node.js 22.17.0):
`python -m scm.check` passes **199 Python tests**, **5 Vitest tests** and
**3 Playwright browser tests**, plus Ruff, strict mypy/TypeScript, Prettier,
contract/OpenAPI/client drift checks and the Next.js production build. The final
frontend uses Next.js 16.4.2 App Router and React 19.3.1, as requested for M9.
Browser tests run the built Next.js server with the actual FastAPI service.

The recorded study contains 36 nodes, 44 lanes, 455 daily health observations per
node and every node's SKU01 inspector, including warm-up. Its API response payloads
are validated against Pydantic consumer contracts. The
[fixture manifest](evidence/m9/fixture_manifest.json) records the source snapshot,
replication seeds, cache output checksums and exported fixture checksum. Frontend
request defaults are generated from `configs/m8_validation.yaml`; chart/KPI values
come from those simulation outputs. No operating parameters are introduced by the UI.

The [browser results](evidence/m9/results.json) and
[manifest](evidence/m9/manifest.json) record these passing flows:

- Next.js response metadata and page title, recorded network rendering, keyboard
  node selection, inspector opening/closing with restored focus, inventory CSV
  export, text queries and local day scrubbing.
- Light/dark screenshots, theme and URL state surviving reload, and the 1280 px
  desktop layout without horizontal page overflow. The three reviewed baselines
  cover the light Control Tower, dark Control Tower and node inspector.
- A 100-node, 108-lane synthetic browser load fixture, with 40 consecutive day
  updates and no additional browser requests during scrubbing. The saved p95
  `cy.batch()` health-update duration is **0.9 ms**, below the 16.7 ms acceptance
  budget. Separate two-animation-frame timings are saved in the result file.
- Actual live run creation/polling, health loading, inspector SKU changes through
  the typed API client, zero paired deltas for a run compared with itself, and a
  visible service error after a controlled 503 response. Browser flows assert no
  uncaught page errors; this caught and fixed a stale resize callback after canvas
  destruction during development remounts.

The load fixture adds explicitly synthetic retailers/lanes and clones a recorded
health trajectory. It verifies browser updates rather than independent operating
behavior or a universal frame-rate guarantee. An earlier full check caught a
formatting failure; the final complete check passes without updating screenshots.
Next.js's route announcer is distinguished from the study's labelled error alert.

`RunNetwork` now optionally carries nominal initial ROP/Q matrices and warm-up
length. Models, generated schema/OpenAPI/client, API serializer and fixture changed
together; older cached runs without these fields remain readable. Initial references
are labelled and are not presented as adaptive daily targets. Query matches clear
when the selected day changes. The recorded inspector intentionally includes SKU01;
live mode supports all 20 SKUs. See [frontend methods](frontend.md) and
[contract changes](../contracts/README.md).

The upstream Starlette TestClient deprecation warning remains non-failing. M10's
other study views, remote CI confirmation, deployed/static demo, Lighthouse and full
accessibility audits remain unverified. These belong to the subsequent milestones;
M9 does not establish calibrated supply-chain recommendations.

## M10: six Next.js study views

Local result (22 October 2026, Python 3.12.10, Node.js 22.17.0):
`python -m scm.check` passes **205 Python tests**, **7 Vitest tests** and
**11 Playwright tests**, plus Ruff, strict mypy/TypeScript, Prettier,
contract/OpenAPI/client drift checks and the Next.js production build. The
first full attempt caught a chart-component formatting issue; it was corrected
before the final complete run. The existing upstream Starlette deprecation
warning remains non-failing.

The [fixture manifest](evidence/m10/fixture_manifest.json) records the M10
exporter's source and output checksums. Export checks reproduce all **64 E4**
replication-zero trajectories and reconcile their DC bullwhip ratios against
M7 Parquet observations. All paired metrics for **six M6 events** match the
saved first-replication results. E2/E3/E4/E6 estimates retain their original
config hashes, case factors, counts, nulls and unbounded intervals. M7 summary
and Parquet hashes are checked before import. A separate checksum audit found
no mismatches in the M10 fixture manifest's inputs or output.

The [browser results](evidence/m10/results.json) and
[browser manifest](evidence/m10/manifest.json) record:

- Six fixture-backed views loading without uncaught browser errors, with
  reviewed full-page screenshot baselines and no horizontal page overflow.
- A live Scenario Lab demand-shock change, matching-seed paired run completion
  and exact agreement between displayed percentage-point/INR delta data and
  `GET /compare`. The visible fill delta is also checked after formatting.
- Bullwhip batching/lead-factor selection and CSV contents matching the selected
  recorded E4 estimate; keyboard EOQ quantity changes; E2 SKU selection; E3
  placement/geographic controls; resilience event and mitigation controls.
- Searchable assumption notes, a real validation Markdown download and a 404
  for a document outside the fixed allowlist. A Control Tower service failure
  no longer leaks into another view after navigation.
- All prior Control Tower flows. The 100-node synthetic load check records
  **0.6 ms p95** `cy.batch()` time across 40 day updates, below its 16.7 ms
  regression budget, with no additional requests during scrubbing.

The new `StudyEvidence` contract and `GET /studies` keep recorded/live transports
aligned. This endpoint serves historical evidence; only Scenario Lab submissions
compute new A/B runs. Representative trajectories are not experimental means:
weekly E4 plots show one replication, M6 timelines retain their unmitigated pair,
and the E6 mitigation tornado is a separate two-run OAT summary. The M5 daily
Chen benchmark is separate from constrained weekly network BWE. EOQ changes
analytical cost only; the M2 stock overlay retains its original Q*.
See [study-view methods](study-views.md), [parameters](parameters.md) and
[contract changes](../contracts/README.md).

The current evidence demonstrates local implementation and API parity, not a
calibrated network-design recommendation. Full research replication counts,
remote CI confirmation, deployment, Docker, Lighthouse and broad accessibility
audits remain unverified. M11 owns the demo/deployment quality work; M12 owns
the final case-study report. Prior milestone evidence retains its historical scope.

## E1: operations simulation workspace

Local result (22 October 2026, Python 3.12.10, Node.js 22.17.0):
`python -m scm.check` passes **206 Python tests**, **10 Vitest tests** and
**13 Playwright tests**, with Ruff, strict mypy/TypeScript, Prettier,
contract/OpenAPI/client drift checks and the Next.js production build. No public
response schema changes are introduced. Tests were written and observed failing
before the new observation helper and playbook catalog were implemented.

The [E1 browser results](evidence/e1/results.json) and
[manifest](evidence/e1/manifest.json) record the current source/artifact hashes and
the actual combined-playbook requests and paired comparison. Existing M9/M10
fixtures remain simulation evidence for their recorded source snapshots.

The checks establish:

- All eight playbooks match their canonical YAML, validate as RunRequest payloads
  and pass actual API reservation, scenario and physical event-target validation.
  Reservation validation does not claim eight full experiments were executed.
- The operations overview's selected-day stockout count equals the recorded
  health matrix with suppliers excluded. Snapshot unit checks cover stockout
  precedence, missing cover, absent days and scoped local-review identifiers.
- Exception reviews survive reload for the same run/day/site and do not appear
  as reviews on another day. Filters, site investigations and existing Control
  Tower/API flows pass. Review marks do not claim physical recovery.
- The demand-surge playbook runs through the real API with **periodic (R,S)**,
  **forecasting** and **lost sales** explicitly selected. Captured A/B requests
  have the correct shared options and separate B demand/capacity shocks. The
  actual comparison and requests are saved in the E1 result artifact.
- Edited inputs mark existing results as belonging to their original submission.
  B opens as an actual Control Tower run. Keyboard command search and 390 px
  navigation/overflow checks pass. Overview, playbook and exception screenshots
  were visually reviewed along with the refreshed desktop/dark shell.
- The existing 100-node synthetic load regression records **0.6 ms p95** health
  batch time for 40 day updates, below 16.7 ms, without extra scrubber requests.

Browser validation caught a page-title conflict between static Next.js metadata
and the selected client module. React now owns the view title; the final checks
pass for both default overview and explicit Control Tower entry points. The
upstream Starlette TestClient deprecation warning remains non-failing.

All operating playbooks are synthetic assumptions, documented in
[parameters](parameters.md) and [workspace methods](operations-workspace.md).
Forecast, policy and demand-shortfall controls expose existing engine behavior;
the UI introduces no claimed data-calibrated demand/price/weather/staffing model.
Apache-2.0 licensing applies to original project code; third-party licenses remain
their own. Live ERP integration, shared approvals, authentication/SSO, RBAC and
distributed production operations are not implemented. Deployment, Lighthouse
and broad accessibility audits remain outside E1 and await M11.

## E2 product expansion: configurable planning lab

Local result (22 October 2026, Python 3.12.10, Node.js 22.17.0):
`python -m scm.check` passes **222 Python tests**, **11 Vitest tests** and
**14 Playwright tests**, plus Ruff, strict mypy/TypeScript, Prettier, generated
schema/OpenAPI/client checks and the Next.js production build. New tests were
observed failing before implementation. The product expansion is separate from
the earlier E2 inventory experiment.

The [planning-lab results](evidence/planning-lab/results.json) and
[manifest](evidence/planning-lab/manifest.json) preserve actual browser comparisons,
representative diagnostics, model provenance and source/output hashes. The
recorded browser exercise executes **two paired replications** and exposes
**20 SKU**, **36 facility** and **44 lane** diagnostic rows. Its short 7-day
warm-up / 21-day measured window is a software smoke exercise, not a research
or operating-policy recommendation. The editor defaults remain 90/365 days.

The checks cover:

- Server restart persistence, revision conflicts, stale-launch rejection,
  immutable historical request/notes, and repeats of the original execution
  after the scenario definition has changed.
- Invalid monthly counts, forecast coefficients, capacity factors, supplier
  probabilities, unknown targets and self-backup rejection. Saved scenarios and
  advanced validation use the actual network/target checks before execution.
- Seasonal settings changing actual draws: with zero demand CV and matching
  seeds, indices 0.5 versus 1.5 produce the expected threefold demand ratio.
  Applying assumptions does not mutate the source study.
- Diagnostic facility costs reconciling with the representative network ledger,
  lane freight with inbound/outbound accounts, SKU shortages with customer-site
  shortages, and SKU inventory values with facility inventory values, including
  a run using forecasting, backup sourcing, safety stock and expediting.
- Pre-demand forecast errors, null-safe diagnostics, repeated-request caching,
  effective model snapshots, and rejection of comparisons across different
  model/config/version fingerprints.
- Browser creation/save-as-new/reload, two-replication background status polling,
  exact paired-cost parity with the API, all three diagnostic tables, reviewed
  editor/comparison/diagnostic screenshots and graceful reload-service failure.
  The first full check caught an ambiguous alert locator matching Next.js's route
  announcer; the lab alert now has an explicit accessible name and the final gate passes.
- All prior Control Tower, lab, playbook and exception flows. The 100-node synthetic
  regression records **1.0 ms p95** health batch time for 40 day updates, below
  16.7 ms, with no additional scrubber requests.

Browser runs now use `data/browser-workspace/`, independently of the normal
planning database/cache. Older run artifacts remain readable; absent historical
diagnostics require a rerun. Earlier evidence retains its original source scope.
The upstream Starlette deprecation warning remains non-failing.

Six public schemas and the default-neutral RunRequest lab extension are documented
in [contracts](../contracts/README.md). New controls reuse existing engine
mechanisms and record effective inputs; contributors are labelled as observed
first-replication measurements, while comparisons use all paired replications.
No arbitrary shared-cost allocation or isolated causal effect is claimed.

[Planning-lab methods](planning-lab.md) describe calibration, held-out validation,
warm-up/horizon selection, independent confirmation seeds and operational pilots.
These checks establish implementation and reconciliation on synthetic data. They
do not establish empirical validity for a specific business, distributed deployment,
access control or production certification. M11 deployment/quality work and M12's
final case-study report remain separate milestones.

## E3 student learning workspace

The user-requested **product E3** milestone (distinct from M7's E3 network-sizing
experiment) passes `python -m scm.check` on Windows/Python 3.12 and Node 22:
**227 Python tests**, **14 frontend unit tests**, **16 Playwright tests**, generated
schema/OpenAPI/client drift, Ruff, mypy, strict TypeScript, formatting and the
Next.js production build. The upstream Starlette deprecation warning is non-failing.

New evidence covers:

- Ten unique, canonical YAML lessons with valid A/B contracts and physical targets,
  matching seeds/replications/windows and explicit assumptions. The exported browser
  catalog equals the YAML; no lesson contains a fabricated result.
- Daily customer demand and immediate service reconciling to SKU demand/shortages,
  all five extended series matching saved representative arrays, supplier/no-policy
  forecasts remaining null, and bounded metric names in generated JSON Schema.
- Older caches retaining original-series reads, absent arrays returning a rerun
  instruction, and missing historical warm-up metadata recovered from the saved
  scenario without rewriting the artifact.
- Interval-based direction/uncertainty indicators, zero/missing observation
  handling, nested request differences and damaged notebook recovery.
- An actual two-replication forecast-window exercise with edited 7-day warm-up and
  21-day measured horizon; displayed cost difference equals the API. The downloaded
  notebook retains exact submitted requests, prediction at launch, comparison,
  reflections and both model provenance documents. Current-draft edits mark results
  stale. A/B selection, all live SKUs, facility changes, relationships/distributions,
  CSV download, notebook reload and Planning Lab hand-off pass in the browser.
- Narrow-screen keyboard tabs, reference/recorded exploration with the simulation
  API unavailable, unknown-run errors, and three reviewed learning screenshots.
  The initial browser check found a source-ID overflow; the shared chart source
  caption now wraps on narrow screens.

The first full gate exposed a Windows status-reader/atomic-replacement race in
the existing run service. Bounded sharing-error retries now have a regression test
for transient recovery, exhaustion and immediate propagation of other permission
errors. The complete final gate passes, including portfolio polling. All previous
lab, Control Tower, playbook, exception and 100-node performance checks remain green.

`npm run record:evidence --prefix web` records browser attachments and source/output
checksums in [learning evidence](evidence/learning-sandbox/results.json) and its
[manifest](evidence/learning-sandbox/manifest.json), preserving E1/E2/M9/M10 history.
The evidence includes the actual student experiment, not an expected-answer key.
The [student/instructor guide](learning-sandbox.md) defines units, grain, timing,
inherited assumptions, statistical limits, storage scope and calibration workflow.
These are synthetic implementation checks, not empirical validation or course grades.

## E6 interactive model builder

The user prioritised this product milestone ahead of E4/E5/M11. The final
`python -m scm.check` passes on Windows/Python 3.12 with **244 Python tests**,
**18 frontend unit tests**, **18 Playwright tests**, generated schemas/OpenAPI/client,
Ruff, mypy, strict TypeScript, formatting and the Next.js production build. The
upstream Starlette warning is non-failing. Earlier milestone evidence is preserved.

The new checks establish:

- Typed custom-model/catalog/preview/spec fixtures and reference-catalog equality.
  Default-free custom supplier identities and bounded DC counts resolve from the
  supplied snapshot, without reference supplier IDs leaking into custom models.
- Custom three-DC routing, effective distance/lead overrides and a real simulation
  with provenance and restart persistence. Layout-only changes reuse cached physics.
  Saved revision history preserves prior inputs; stale updates fail without loss.
- Invalid sourcing, duplicate IDs, unsupported/cyclic lane directions, closed DC
  references, explicit count mismatches, versions, regions, negative lane parameters,
  workload limits and ambiguous generated edge IDs fail before creating a run.
- Parameter comparisons within the same ordered master are accepted; comparisons
  across different customer/master identities are rejected. Source/version, seed
  and window compatibility checks remain in place.
- Reference-safe facility rename/deletion/duplication, source assignments and
  diagram-versus-geographic movement, including unchanged coordinates at untouched
  facilities. All existing engine invariants and prior API tests remain green.
- Real browser clicks connect an open DC to a customer; real dragging saves diagram
  positions without altering geography. The browser edits SKU cost and lane inputs,
  renames a DC, saves/restores two revisions, runs two replications of a custom
  six-facility/two-SKU model, verifies provenance, exports PNG, reloads and opens the
  saved model in Planning Lab with its three-DC/custom-supplier context intact.
- Narrow-screen add/undo/redo, protected referenced-supplier deletion and invalid
  imports pass. The reviewed diagram screenshot is stored with the browser tests.
  Validation caught a stale edit message masking import errors; new operations now
  expose their own error. Canvas geometry is refreshed after surrounding layout
  changes, and pointer tests scroll the target canvas into the viewport.

The evidence recorder now writes [builder results](evidence/network-builder/results.json)
and a [source/output manifest](evidence/network-builder/manifest.json), including the
actual model launch snapshot and run provenance. Existing recorded result bundles
remain readable; the public RunRequest fixture now explicitly shows default-null
model support. [Builder methods](network-builder.md) document source assumptions,
configured-versus-achieved quantities, cache/revision semantics and model limits.
This does not certify an arbitrary topology, a manufacturing/BOM model or shared
enterprise deployment. E4, E5, M11 and M12 remain separate work.

## E9 enterprise interaction and motion polish

The final `python -m scm.check` passes on Windows/Python 3.12 and Node 22:
**244 Python tests**, **18 frontend unit tests**, **22 Playwright tests**, generated
schema/OpenAPI/client drift, Ruff, mypy, strict TypeScript, formatting and the
Next.js production build. The existing Starlette deprecation warning is non-failing.

Four new browser journeys establish normal motion, actual server save feedback and
disabled pending actions; all builder tab keys and wrap-around; selected inspectors;
explicit/repeated fit and zoom; actual pointer hover and lane-highlight cleanup;
immediate reduced-motion viewport actions and zero-duration Cytoscape transitions;
device preference changes, reload persistence, cross-tab synchronisation and denied
storage; and search/drawer/mobile navigation focus restoration on dark/narrow screens.
Changing motion preferences preserves the open draft. Device reduced motion and a
browser-local preference both suppress CSS movement and looping loading indicators.

Validation caught two interaction defects: cancelling a Radix exit animation by
removing its name could leave a dismissed dialog layer mounted; zero-duration
animations now retain their completion events. Cytoscape delegated mouseout did not
always clear hover when leaving the canvas; pointer leave/cancel explicitly cleans
up the highlight. Both cases are covered by the final passing browser suite.

All previous simulation, paired lesson, model revision/run/provenance, scientific
export and error flows remain green. The 100-node Control Tower check retains its
16.7 ms health-batch budget and verifies no additional daily scrubber requests.
Two reviewed screenshots cover the builder canvas and dark mobile motion settings.
No animation package or simulation/schema change was needed.

The evidence recorder now writes [interaction results](evidence/interaction-motion/results.json)
and a [source/output manifest](evidence/interaction-motion/manifest.json), preserving
the earlier milestone directories. The [motion guide](interaction-motion.md) records
timings, keyboard behaviour, preference storage and scientific-data boundaries.
This is a focused Chromium interaction pass; M11's broader accessibility and delivery
audit, and the remaining planning/teaching modules, remain separate milestones.

## M12 README walkthrough subtask

The README portion requested independently of the remaining M12 deliverables now
passes the full `python -m scm.check` gate: **246 Python tests**, **18 frontend unit
tests**, **22 Playwright tests**, schema/OpenAPI/client drift, Ruff, mypy, strict
TypeScript, formatting and the Next.js production build. The existing upstream
Starlette warning remains non-failing. No application or simulation behaviour changed.

Two new documentation checks verify all 13 workspace modules, relative links and
in-document navigation, descriptive image text, PNG signatures/dimensions and
screenshot/run-evidence hashes. The walkthrough embeds 20 real Chromium captures;
a local Markdown rendering loaded all 20 images without horizontal page overflow.
The overview, specialist gallery and capture contact sheet were visually reviewed.

`npm run capture:walkthrough --prefix web` completes actual website journeys against
an isolated documentation API/run root. Learning and planning results use the
unchanged canonical forecast lesson, with API cost deltas checked before capture.
Model validation/save, screenshot sources, UI revision and output checksums are
retained in the [capture manifest](images/walkthrough/manifest.json) and its three
linked evidence bundles. The user's normal portfolio is separate. JSON evidence
bytes are protected from Git newline conversion; earlier milestone evidence and
browser baselines are preserved.

The [screenshot guide](images/walkthrough/README.md) explains recreation and scope.
The README distinguishes recorded, analytical, input-preview and newly simulated
evidence, browser/session state versus server persistence, and supported versus
planned capabilities. This completes the feature-tour subtask, not M12's final
case study/report, executive summary, resume or interview deliverables.

## E4 persistent decision cases

The case foundation passes the full `python -m scm.check` gate: **266 Python tests**,
**20 frontend unit tests**, **25 Playwright tests**, strict TypeScript, mypy, Ruff,
formatting, schema/OpenAPI/client drift and the Next.js production build. The
upstream Starlette test-client deprecation warning remains non-failing.

Fifteen focused Python case tests cover restart persistence, immutable paired
evidence after raw cache removal, revision conflicts, exact run attachment,
incompatible windows/masters, package versions, malformed provenance, shared queue
capacity and cache identity stability across a saved JSON round trip. A Windows
status-read regression verifies transient sharing-lock recovery, bounded retries
and propagation of unrelated permission failures. Five new
root contract fixtures validate the additive schemas. Frontend tests distinguish
supported/breached/uncertain/missing criteria and validate recovery envelopes.

Three browser journeys exercise the real engine and compare rendered cost deltas
against API outputs. They cover create/edit/save/run, historical goals versus
current notes, Control Tower round trips, browser-draft recovery, package export
and import, externally supplied archive labels, stale saves without lost drafts,
keyboard tabs and 390px layout, API failure, and complete learning/model handoffs.
The prior 22 journeys remain green, including 100-node local scrubber requests
and its existing 16.7ms health-batch budget. The updated Planning Lab editor
baseline and new case evidence screenshot were visually reviewed.

The recorder now writes [case results](evidence/decision-cases/results.json) and a
[source/output manifest](evidence/decision-cases/manifest.json), preserving earlier
milestones. The README adds an actual case screenshot and distinguishes the new
API-backed home route from the API-free recorded overview. The [case guide](decision-cases.md)
documents contracts, storage, import trust, acceptance semantics and recovery.
This completes E4; E5 stage replay, E7 bounded failure search/independent validation
and M11 delivery/access control remain separate milestones.
