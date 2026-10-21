# M3 network simulation

M3 adds configuration loading, geographic DC selection, multi-echelon replenishment,
four inventory policies, FIFO dispatch and FTL/LTL freight. M2's single-node engine
remains available. No dependencies or wire contracts changed: `as_contract(run_id)`
returns the existing columnar network contract with zero flow for its static topology.
The new Pydantic configuration models are internal inputs, not API payloads.

Run from the repository root:

```python
from scm.config.loader import load_study
from scm.network.builder import build_network
from scm.network.inputs import network_inputs
from scm.sim.multi_echelon import simulate_network

study = load_study()
network = build_network(study.spec, study.scenario)
days = study.scenario.warmup_days + study.scenario.horizon_days
demand, leads = network_inputs(network, study.seasonality, seed=303, days=days)
result = simulate_network(network, demand, leads, warmup_days=study.scenario.warmup_days)
print(result.measured_cost.sum())
```

`load_study` reads the scenario, network master and monthly seasonality YAMLs. It
rejects unknown/omitted primary suppliers, duplicate identifiers, invalid numbers,
insufficient DC candidates and nonempty disruption lists. The master describes
synthetic sites and costs; it is not a calibrated Indian logistics network.

## Network and inventory policy

Haversine distances use a 6371 km sphere, multiplied by the configured circuity.
Demand-weighted k-median opens DCs greedily, then performs improving one-site swaps.
Ties are deterministic. This is a local demand-distance solution; fixed cost and
freight tradeoffs are evaluated by simulation, not optimized by the site selector.
Each customer uses its nearest open DC; each SKU has one primary supplier.

Known nominal demand means and variances determine fixed policy targets. DC demand
aggregates assigned customers; within-region retail covariance uses the configured
rho. B2B arrivals are independent Bernoulli draws with lognormal conditional order
sizes. Daily B2B variance includes both arrival and size variability. The gamma
copula's latent rho, clipped-normal moments and seasonally varying demand make these
policy moments approximations. No achieved service guarantee follows from a target CSL.

EOQ sets Q, rounded up to MOQ and pack size. DC MOQ also respects the primary
supplier's minimum. R uses the normal safety-stock formula including lead variance.
Nominal transit includes supplier processing or outbound handling plus lane distance
divided by travel speed. Gamma leads round up to at least one day. The policy
approximation adds half a day to nonzero-CV lead means and includes Bernoulli delay
mean/variance; it omits rounding variance and capacity queueing time.

| Policy | End-of-day review and order |
| --- | --- |
| (Q,R) / `QR` | If inventory position is below R, place enough effective Q lots to reach R |
| (s,S) / `sS` | If inventory position is below R, order up to S = R + Q |
| Periodic (R,S) / `RS` | On day 0 and each review interval, order up to a lead-plus-review protection target |
| `order_up_to` | Daily order up to a lead-plus-one-day protection target |

All positive orders round to MOQ and packs. Quantity is continuous elsewhere;
capacity-limited partial shipments can be smaller than a pack or MOQ. Initial stock
is the policy's upper target times `initial_stock_fraction`; supplier stock, pipeline
and backlogs start at zero. Supplier material is unlimited but dispatch capacity is
finite. Capacity means units dispatched per day across all SKUs, not storage space.

## Daily timing and balances

1. Receive shipments, reducing on-order quantities.
2. Clear old customer backorders first; serve today's demand and record immediate
   service. Shortfalls become backorders unless `lost_sales=True`.
3. Review customer inventories, then DC inventories. DC inventory position includes
   today's new customer orders as obligations: stock + on-order − customer backorders
   − pending downstream replenishment orders.
4. Allocate stock and shared source capacity to the oldest replenishment orders.
   Same-day ties use node order, then SKU order. An unavailable SKU does not block
   available SKUs. Suppliers produce the exact quantities they dispatch.
5. Dispatch shipments and accrue costs. Arrival is dispatch day plus the transit
   draw indexed by the original order day and lane, including partial shipments.
   Transit can overtake; there is no end-of-horizon liquidation.

The simulation loops over days only, vectorizing SKU/node allocation. Setup routines
iterate candidate sites and lanes outside the simulation loop. On-order includes
both waiting orders and shipments in transit. `pending` is recorded at the source,
while `on_order` is recorded at the destination. Tiny negative exhausted-stock values
from floating-point cumulative sums are clipped to zero; tests reconcile at 1e-7 units.

Histories use `(day, SKU, node)`, except demand `(day, SKU, customer)` and shipment
histories `(day, SKU, edge)`. Truck trips and LTL units use `(day, edge)`. Tests check
initial stock + receipts + supplier production − dispatches − customer fulfillment
= on-hand; orders − receipts = on-order; dispatches − receipts = in-transit;
on-order = pending + in-transit network-wide; and customer demand balances.

## Costs and transport

All components are `(day, node)` INR arrays. Purchases are charged on supplier
dispatch to the receiving DC, using SKU cost times supplier price multiplier.
Daily lane freight consolidates all SKUs and chooses the cheapest of all LTL,
all FTL (possibly a partially filled last truck), or full trucks plus LTL residual.
Mode choice changes cost only, not transit time. Inbound/outbound freight is
attributed to the receiving node. No cross-lane or multi-day consolidation occurs.

Ordering cost is per effective fixed-Q lot for QR and per positive SKU order for
other policies. Holding cost uses purchase valuation times annual holding rate /365.
Customer demand drains uniformly within a day after old backlog clears; DC stock
is held from morning receipt until end-of-day dispatch. Initial inventory is not
purchased again. DC fixed cost is annual fixed cost /365 for each open DC, and DC
handling cost is charged per dispatched unit. Shortage penalties apply once per
new unfilled customer unit, not again on subsequent backlog days. Total cost is the
sum of all eight components; `measured_cost` excludes warm-up days.

## Reproducibility and scope

SeedSequence provides separate demand, transit, delay and B2B streams. Customer/SKU
axes remain fixed across DC counts. Transit uniforms use the full candidate-lane
universe (all supplier–candidate-DC and candidate-DC–customer combinations), then
select active lanes. Changing DC count therefore preserves demand draws and the
uniforms of common lanes. Keep master IDs/order and simulation horizon fixed for
paired scenario comparisons.

The default call uses M3's fixed known-demand policies. M4 adds opt-in
[forecasting and ABC–XYZ policies](forecasting.md), requiring a separate historical
demand array. M5 activates scenario bullwhip switches when an explicit
[bullwhip configuration](bullwhip.md) is supplied. M6 applies configured
[disruption events](resilience.md) during simulation, with validated target references.
No live API or frontend is added here.
The 90-day warm-up and nominal service targets still require network calibration.

Reproduce V5 and both performance gates with:

```powershell
.\.venv\Scripts\python.exe -m scm.sim.validate_network --output docs/evidence/m3
```

The runner uses a standard-library process pool for this benchmark. M7's general
experiment runner and Parquet outputs remain separate work. Timings vary by host;
saved results contain raw replication summaries and source/config/output hashes.
