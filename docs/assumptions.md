# Assumptions

- The study uses daily buckets; `horizon_days` excludes warm-up.
- Model defaults mirror the versioned YAML base preset; tests require equality.
- Monetary values use INR. M2 cost inputs are synthetic validation assumptions,
  not estimates of Indian operating costs.
- Fractions use [0, 1]; target CSL is strictly between 0 and 1.
- Null denotes an undefined metric, never a measured zero.
- Seasonality uses a neutral monthly profile on a repeating 365-day calendar.
  Segmentation identifies the M4 map when forecast planning is explicitly enabled.
- Contracts are initial boundaries. Future milestone changes need a documented reason,
  regenerated schemas and matching consumer/fixture changes.
- M1 uses continuous analytical quantities; pack-size/MOQ rounding belongs to policies.
  EOQ/EPQ assume constant demand without shortages. Normal-loss service calculations
  are approximations, not simulation validation; see [analytics](analytics.md).
- M1 adds no operating parameters or estimated costs. Its numerical examples are
  test data only, with provenance in [analytics](analytics.md).
- M2 uses an unlimited upstream supplier and fixed known-demand (Q,R) settings.
  Demand drains uniformly within a day for holding-cost integration. Review occurs
  after demand and triggers only below R. Shipment dates are rounded up to at least
  one day; B2B demand allows at most one order per SKU-node-day.
- The long-lead validation uses 1000 warm-up days, supported by its Welch plot.
  This does not establish that the base network's planned 90-day warm-up is sufficient.
- M3 sites, SKU economics, capacities and penalties are synthetic study assumptions.
  Fixed demand-based targets use nominal moments; gamma correlation, normal clipping,
  discretized leads and capacity waiting can change realized service. See
  [network conventions](network.md) and [parameter provenance](parameters.md).
- M3 capacity is dispatch throughput shared across SKUs. Sources fulfill replenishment
  orders by age, with node/SKU ties; packs and MOQ apply to order placement, not partial
  dispatches. Suppliers have unlimited raw material and finite dispatch throughput.
- The M3 V5 experiment checks independent protection-period demand quantiles at four
  correlations. It does not establish pooling savings under constrained network service.
- The default M3 call retains known-demand policies. Planning and bullwhip settings
  explicitly enable M4/M5 behavior. M6 applies scenario disruption events automatically.
- M4 learns fixed global SKU classes from separate historical demand; XYZ uses
  network-total daily demand, so aggregation can move locally variable SKUs into X.
  A/B threshold crossers stay in the class they enter. Zero-demand SKUs are CZ.
- M4 smoothing settings and nine-cell policies are illustrative assumptions. Daily
  targets use next-day forecasts and rolling population demand variance. B2B target
  CSLs remain floors; actual service still depends on capacity and forecast error.
- E5 dry-run calibration and evaluation use independent seeds. Service matching has
  a 0.5-percentage-point tolerance; two evaluation replications do not establish savings.
- M5 uses an order-up-to control with daily review and no MOQ/pack constraints.
  Batching enables a common review calendar and multiple-lot orders. Signal processing
  recalculates targets from causal forecasts; it requires uniform planning.
- M5 promotions are synchronized synthetic supplier discounts and forward-buy targets;
  rationing uses the previous dispatch fraction and does not cancel inflated orders.
  VMI bundles POS sharing, daily replenishment and removal of rationing gaming.
  These mechanisms are illustrative, not estimates of buyer behavior.
- Weekly BWE discards warm-up before aggregation and ignores the final incomplete week.
  Supplier orders received duplicate DC orders because no upstream purchasing stage exists.
  The daily Chen benchmark is separate and permits signed orders as cost-free returns.
- Lead reduction scales and rounds transit days; target lead moments are approximations.
  Three paired M5 runs check effect directions, not statistical generality. Full E4 and
  network service/warm-up calibration remain M7 work. See [bullwhip conventions](bullwhip.md).
- M6 events use half-open intervals from simulation day zero, including warm-up.
  Multipliers compose by multiplication; capacity cuts and discounts multiply retained
  fractions. Lead events apply to order-date transit draws, not existing in-transit stock.
- Event price promotions discount supplier purchases without automatically causing
  forward buying. M5's separate buyer-behavior controls can be enabled explicitly.
  Physical targets are not recalibrated from advance knowledge of an event.
- TTS is the earliest affected SKU/customer shortage, with fractional-day coverage
  under uniform consumption; it can include shortages also present in the baseline.
  TTR compares volume-weighted rolling fill with the paired undisturbed run and is
  measured at day close after the first observed breach. Later relapses are possible.
- M6 paired costs include the whole network from event start to horizon; negative
  differences are allowed. Multiple simultaneous events are not causally separated.
  Backorder runs have zero lost sales; no observed stockout/recovery is censored.
  Mitigation sweeps and sensitivity analysis remain E6/M7 work. See [resilience](resilience.md).
- M7 implements all E1–E6 grids with independently seeded phases and paired records.
  E2 uses one master SKU per A/B/C class; it does not estimate whole-class performance.
  E3 confirmation uses separate seeds only for DC counts close on screening means.
  E5's equal-service claim is conditional on both reported matching checks.
- M7 buffers add nominal coverage to policy targets and starting stock; initial
  acquisition remains outside measured purchase expense. Expediting is a standing
  all-lane policy with a per-unit premium. Reactive backup suppliers use remaining
  throughput after primary commitments and charge their own purchase multiplier.
  Lateral transshipment is deferred under the plan's descoping provision.
- M7 acceptance runs cover all factor cells with reduced replication counts.
  Confidence intervals are descriptive and exclude nulls with missing counts saved.
  Censored recovery means are conditional on recovery being observed. No multiple
  comparison adjustment or calibrated operational conclusion is claimed. Exact
  Parquet byte reproduction is scoped to the pinned environment. See [experiments](experiments.md).
