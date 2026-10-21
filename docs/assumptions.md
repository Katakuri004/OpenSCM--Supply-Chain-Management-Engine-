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
- M3 does not interpret forecast/segmentation/bullwhip scenario flags; those belong
  to M4/M5. Nonempty disruptions are rejected pending M6.
- M4 learns fixed global SKU classes from separate historical demand; XYZ uses
  network-total daily demand, so aggregation can move locally variable SKUs into X.
  A/B threshold crossers stay in the class they enter. Zero-demand SKUs are CZ.
- M4 smoothing settings and nine-cell policies are illustrative assumptions. Daily
  targets use next-day forecasts and rolling population demand variance. B2B target
  CSLs remain floors; actual service still depends on capacity and forecast error.
- E5 dry-run calibration and evaluation use independent seeds. Service matching has
  a 0.5-percentage-point tolerance; two evaluation replications do not establish savings.
