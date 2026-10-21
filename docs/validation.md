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
the current implementation.

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
