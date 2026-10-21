# M4 forecasting and ABC–XYZ replenishment

M4 adds moving averages, simple exponential smoothing (SES), Holt smoothing,
forecast error metrics, historical ABC–XYZ classification, and a nine-cell policy
map. Forecast-driven replenishment is opt-in; calls without planning settings retain
the M3 known-demand behavior. No wire contracts, fixtures or dependencies changed.

`configs/planning.yaml` supplies validated internal settings. The existing scenario
`policy.segmentation` identifier names the `abc_xyz_v1` map; `segmented` in the planning
settings selects whether to apply it. The uniform arm uses the scenario's default
policy and target CSL. M5 adds a separate opt-in [bullwhip configuration](bullwhip.md)
that activates the scenario cause switches and requires uniform planning.

## Causal forecasts

`Forecaster(initial, variance, settings)` accepts aligned SKU/node arrays.
Read `prediction` before `update(observed)` to obtain a one-day-ahead forecast.
Updates vectorize over all series; only the day axis is iterated.

| Method | Update after observing demand y |
| --- | --- |
| Moving average | Level = mean of the latest `window` observations, using available observations during startup |
| SES | Level = alpha × y + (1 − alpha) × previous level |
| Holt | Level = alpha × y + (1 − alpha) × (previous level + previous trend); trend = beta × level change + (1 − beta) × previous trend |

The next forecast is the level, or level plus trend for Holt, clipped at zero.
The raw-demand variance is the population variance of the rolling window; the
supplied initial variance is retained until there are two observations. It is not
the forecast-residual variance. No seasonal forecast or automatic parameter fitting
is introduced in M4.

The network planner requires a separate historical-demand array with shape
`(past day, SKU, customer)`, at least two days, in the same master order as the
network. The caller must provide past observations, not measured future demand.
The E5 runner enforces independent training/calibration/evaluation random streams.
The planner fits customer forecasts to historical demand and initializes DC
forecasts from assigned customers' aggregated historical consumption, used as a prior
for replenishment orders. Levels start at the first historical observation; trends
start at zero. During simulation, customer forecasts observe full demand, including
unfilled units; DC forecasts observe incoming customer replenishment orders.

At the start of each day, `result.forecast` logs the forecast made before today's
observation. Customer forecasts update after demand and before customer ordering.
DC forecasts update after customer ordering and before DC ordering. The forecast
after each update determines the next replenishment target. `result.observed_demand`
records the corresponding customer demand or DC order signal. Supplier entries are
zero and excluded from forecast diagnostics. Tests change future demand and verify
that earlier forecasts and orders remain identical.

## Classification and policy assignment

`classify(history, unit_cost, settings)` takes `(past day, SKU)` demand aggregated
over customer nodes. ABC ranks SKUs by annual consumption value: mean daily units
× 365 × supplier-adjusted purchase price. Stable ties retain master order. The item
crossing the cumulative 80% boundary remains A; the item crossing 95% remains B.
Classification uses cumulative share *before* each SKU. Zero-value SKUs are C.

XYZ uses the population standard deviation divided by mean of each SKU's daily
network-total demand. CV <0.5 is X, 0.5 ≤ CV ≤1 is Y, and CV >1 is Z. A zero-mean
series has undefined CV (infinity internally) and is assigned Z. ABC–XYZ classes
are frozen before simulation and apply to that SKU at every stocking node. They do
not use the synthetic `value_class` labels in the SKU master.

Network aggregation can reduce CV substantially. All SKUs in the saved base dry
run classify as X; this is an output, not a forced assignment. A separate fixture
exercises all nine cells. These global SKU classes are not per-store classifications.

| Cell | Policy | Nominal target CSL |
| --- | --- | --- |
| AX | (Q,R) | 98% |
| AY | (Q,R) | 97% |
| AZ | (s,S) | 95% |
| BX | (Q,R) | 95% |
| BY | Periodic (R,S) | 95% |
| BZ | (s,S) | 92% |
| CX | Periodic (R,S) | 90% |
| CY | Periodic (R,S) | 90% |
| CZ | (s,S) | 85% |

This is an assumed illustrative map, not an optimized policy recommendation.
The planner computes EOQ, reorder points and order-up-to targets using the current
forecast and rolling demand variance, with the same lead-time approximation and
MOQ/pack rules as M3. Holt's next-day forecast is treated as flat over the protection
period; trend is not separately projected across every transit day. Initial stock
uses the fitted upper target, with the configured initial-stock fraction; the result
exposes this as `initial_stock` for balance checks. The input network is not mutated.

`safety_factor_offset` adds to z = Phi-inverse(target CSL), allowing service matching
without changing policy assignments. B2B z never falls below its contractual target,
even with a negative adjustment. This preserves the nominal target, not a guarantee
of achieved service under finite capacity or forecast error.

To opt in, add these arguments to the network example in [network.md](network.md):

```python
from scm.config.planning import load_planning

result = simulate_network(
    network,
    demand,
    leads,
    planning=load_planning(),
    demand_history=historical_demand,
    warmup_days=study.scenario.warmup_days,
)
```

Use `settings.segmented = False` before the call for uniform policies with the same
forecasting. Supplying only settings or only historical demand is an error.

## Forecast diagnostics

`error_metrics(actual, predicted)` reduces the first (day) axis and preserves other
axes. Error is actual − forecast, so positive bias means underforecasting.

| Metric | Definition / undefined cases |
| --- | --- |
| MAD | Mean absolute error, in units |
| Bias | Mean signed error, in units |
| MAPE | Mean absolute percentage error over strictly positive actuals; NaN if none |
| wMAPE | Sum absolute error / sum actuals; NaN if actual total is zero |
| Tracking signal | Sum signed error / MAD; NaN if MAD is zero |

Percentage metrics are fractions, not values multiplied by 100. Errors on zero-demand
days still contribute to MAD, bias and wMAPE. Undefined results are NaN internally
and JSON null in evidence. Diagnostics use prior forecasts, never forecasts updated
with the observation being scored. E5 reports customer network totals and DC order
totals separately; aggregate errors can cancel and do not measure every SKU's accuracy.

## E5 dry run

```powershell
.\.venv\Scripts\python.exe -m scm.experiments.e5_dry_run --output docs/evidence/m4
```

The runner fits classifications and forecasts on an independent 180-day history.
It runs two uniform-policy calibration replications, searches eight segmented z
adjustments on those same calibration seeds, and selects the smallest absolute
blended fill-rate gap. Ties prefer smaller absolute adjustments. It then evaluates
both policies on two new paired seeds, without retuning. Each replication uses 90
warm-up plus 365 measured days. The service tolerance is 0.005 absolute fill-rate
units (0.5 percentage points), on mean replication fill rates weighted by demand
across customers and SKUs within each replication.

Evidence retains all candidates, the selected adjustment, held-out forecasts/errors,
cost/inventory summaries, seeds, classifications and source/config/output hashes.
Average inventory value includes daily integrated on-hand at DCs and customers,
valued at purchase price; transit inventory is excluded. Differences are segmented
minus uniform. A nonmatching dry run writes evidence and exits unsuccessfully.

This checks the E5 workflow, not a powered savings claim. M7 still needs more
replications, confidence intervals, broader regimes and parameter/service calibration.
The existing network warm-up limitation remains. See [validation](validation.md)
for the measured result, including the inventory increase in this synthetic case.
