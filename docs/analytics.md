# Inventory analytics (M1)

Import functions from `scm.analytics.eoq`, `epq`, `discounts`, `safety_stock`,
`newsvendor` and `pooling`. These are deterministic mathematical benchmarks for
later engine validation, not study findings. Contracts and scenario defaults are unchanged.

| Module / function | Result and units |
| --- | --- |
| eoq.eoq(D, S, H) | sqrt(2DS/H), units per order |
| eoq.annual_cost(Q, D, S, H) | DS/Q + HQ/2, currency/year, excluding purchases |
| epq.epq(D, S, H, P) | EOQ / sqrt(1-D/P), units per production lot |
| discounts.all_units_discount(D, S, i, tiers) | Quantity, unit price, annual total cost |
| safety_stock.lead_time_std(d, sd, L, slt=0) | sqrt(L sd² + d² slt²), units |
| safety_stock.z_for_csl(target) | Standard normal quantile |
| safety_stock.cycle_service_level(z) | Phi(z), fraction for nonzero variance |
| safety_stock.safety_stock(z, sigma_l) | z sigma_l, units |
| safety_stock.reorder_point(d, L, z, sigma_l) | dL + z sigma_l, units |
| safety_stock.normal_loss(z) | G(z) = phi(z) - z Phi(-z) |
| safety_stock.fill_rate(z, sigma_l, Q) | 1 - sigma_l G(z)/Q |
| safety_stock.z_for_fill_rate(target, sigma_l, Q) | Brent root of the loss equation |
| newsvendor.critical_ratio(Cu, Co) | Cu/(Cu+Co) |
| newsvendor.normal_quantity(mean, std, Cu, Co) | max(0, mean + std Phi-inverse(Cu/(Cu+Co))) |
| pooling.pooled_safety_stock(z, L, daily_std, correlation) | z sqrt(L) sqrt(sigmaᵀ rho sigma) |

`D` and `P` are annual rates; `S` is currency/order and `H` currency/unit/year.
Daily demand moments use units/day, lead-time moments use days. Use one currency
consistently (INR for the study). Inputs must be finite; nonnegative demand and
standard deviations, positive setup/holding costs and positive newsvendor marginal
costs are required. EPQ requires P > D. Probability targets exclude 0 and 1.

Zero annual demand produces zero EOQ/EPQ. A zero order quantity is valid for cost
evaluation only at zero demand. Fill-rate calculations require Q > 0. With zero
demand variance, the fill-rate solver returns z=0 (no buffer) and achieved fill
rate is 1, meeting any permitted target. Phi(0) is not the deterministic CSL.

All-units tiers are `(minimum_quantity, unit_price)` pairs, starting at zero,
with increasing thresholds and nonincreasing positive prices. Holding cost is
`i * unit_price`, where `i` is the annual holding rate. Each feasible tier EOQ or
lower breakpoint is evaluated including purchase cost. Upper breakpoints use the
next tier's price. Results are continuous; integer packs, freight and capacity
constraints belong to later policy/network work.

Demand over lead time assumes independent daily demands and independence of demand
from lead time. Pooling assumes a common deterministic lead time; it accepts valid
negative correlations as well as positive ones. Correlation matrices must be finite,
symmetric, unit-diagonal and positive semidefinite (numerical tolerances 1e-12 for
symmetry/diagonal and 1e-10 for eigenvalues).

Normal approximations can produce negative buffers/ROPs below 50% CSL. These are
preserved instead of silently changing the target. A negative approximate fill rate
raises ValueError; it signals inputs outside this approximation's useful domain.
The newsvendor quantity has a nonnegative decision constraint. All functions use
floating-point arithmetic, not exact-decimal accounting.

## Worked examples and provenance

- [MIT ESD.273J Inventory and EOQ Models](https://ocw.mit.edu/courses/esd-273j-logistics-and-supply-chain-management-fall-2009/resources/mitesd_273jf09_lec02/)
  supplies the EOQ, EPQ and quantity-discount model reference. Hand-worked test
  inputs (not copied course data): D=10000, S=50, H=4 give Q=500 and annual relevant
  cost 2000; P=20000 gives EPQ 707.106781. At holding rate 0.2, prices 10 below
  Q=1000 and 9 thereafter give optimal Q=1000 and total annual cost 91400.
- [MIT 2.854 Inventory, 2016](https://www.ocw.mit.edu/courses/2-854-introduction-to-manufacturing-systems-fall-2016/6c8fec8f99bcf7059b73b82e96d43901_MIT2_854F16_Inventory.pdf),
  slides 29–30: selling price 1, salvage 0, mean 100, standard deviation 10;
  costs 0.25 and 0.75 yield critical ratios 0.75 and 0.25. The resulting normal
  quantiles are 106.744897502 and 93.255102498 (computed for these tests).
- Plan §5.4 supplies the safety-stock, fill-rate and pooling equations. Hand-worked
  safety-stock inputs d=100, sd=20, L=4 give sigma_l=40, and 95% CSL gives
  ROP=465.794145078. Four equal, independent sites halve pooled safety stock
  relative to separate stocking; perfect positive correlation removes that reduction.

These numbers are test fixtures, not calibrated parameters or report results.
