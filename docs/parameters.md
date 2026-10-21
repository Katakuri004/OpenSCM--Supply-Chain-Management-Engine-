# Parameters and provenance

All current defaults are study-design ASSUMPTIONS copied from plan sections 4–5,
not empirical estimates. M2 introduces synthetic validation costs listed below;
they are not operating estimates for the planned Indian network.

| Parameter | Value | Unit | Source or ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- | --- |
| horizon_days | 365 | measured days | ASSUMPTION: plan §5.1 | N |
| warmup_days | 90 | days | ASSUMPTION: plan §5.1; needs Welch check | N |
| replications | 30 | runs | ASSUMPTION: plan §5.1 | N |
| dc_count | 4 | DCs | ASSUMPTION: base network, plan §4 | N |
| suppliers | S1, S2, S3, S4 | identifiers | ASSUMPTION: plan §4 | N |
| cv_scale | 1.0 | multiplier | ASSUMPTION: base variability, plan §4 | N |
| regional_rho | 0.3 | correlation | ASSUMPTION: plan §4 | N |
| seasonality | monthly_index_v1 | preset ID | ASSUMPTION: neutral profile in configs/demand.yaml | N |
| default policy | QR | policy ID | ASSUMPTION: plan §4 | N |
| target_csl | 0.95 | fraction | ASSUMPTION: plan §4 | N |
| segmentation | abc_xyz_v1 | preset ID | ASSUMPTION: plan §4; mapping defined in M4 | N |
| signal_processing, batching | true | boolean | ASSUMPTION: plan §4 | N |
| price, rationing, pos_sharing | false | boolean | ASSUMPTION: plan §4 | N |
| disruptions | empty | event list | ASSUMPTION: undisturbed baseline, plan §4 | N |

Fixture numbers are synthetic examples only and never scenario calibration data.

## M2 validation parameters

All entries in `configs/m2_validation.yaml` are ASSUMPTIONS for numerical validation.
Long-lead service cases deliberately exercise the normal approximation with small
daily review error; they do not represent a calibrated Indian lane.

| Parameter | Value | Unit | Source or ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- | --- |
| seed | 20261012 | seed | ASSUMPTION: reproducible benchmark identifier | N |
| replications | 30 | independent runs | Plan §5.1 | N |
| warmup_days | 1000 | days | ASSUMPTION: long-lead validation; see Welch plot | N |
| horizon_days | 10000 | measured days | ASSUMPTION: stable cost estimates | N |
| daily_mean / daily_std | 10 / 2 | units/day | ASSUMPTION: cost benchmark | N |
| order_cost | 10 | INR per fixed-Q lot | ASSUMPTION: synthetic cost | N |
| unit_cost | 3 | INR/unit | ASSUMPTION: synthetic purchase price | N |
| annual_holding_cost | 7.3 | INR/unit/year | ASSUMPTION: EOQ = 100 in cost case | N |
| shortage_cost | 0 | INR/new shortfall unit | ASSUMPTION: isolate EOQ ordering/holding tradeoff | N |
| lead_mean | 3 | days before discretization | ASSUMPTION: cost case | N |
| q_multipliers | 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2 | × EOQ | ASSUMPTION: V2 sweep | Y |
| service.horizon_days | 30000 | measured days | ASSUMPTION: enough complete cycles | N |
| service.daily_std | 4 | units/day | ASSUMPTION: service case | N |
| service.lead_mean / lead_cv | 100 / 0.05 | days / ratio | ASSUMPTION: service benchmark; CV also tested at 0 | Y |
| service.quantity / fill_quantity | 1000 / 400 | units | ASSUMPTION: CSL / fill-rate cases | N |
| service.target_csl / target_fill_rate | 0.95 / 0.95 | fraction | Plan's baseline service target, reused for validation | N |
| crn_quantity_multiplier | 1.1 | × EOQ | ASSUMPTION: paired policy comparison | N |
| welch_window | 201 | days | ASSUMPTION: centered smoothing window | N |
| base_warmup_days | 90 | days | Plan §5.1; reference marker only | N |
| monthly_index_v1 | twelve 1.0 values | multiplier | ASSUMPTION: neutral until calibrated | N |

Derived policy settings use M1 EOQ and ROP formulas. Initial on-hand is Q + R,
initial pipeline/backlog is zero, review is daily, and annual costs use 365 days.
Demand defaults to zero trend, no correlation and no seasonal modulation unless
provided; B2B arrivals default to probability 1 (callers should supply a calibrated
probability). These are function defaults, not calibrated scenario values.

## M3 network master

Every operating value in `configs/network.yaml` is an **ASSUMPTION**, including
coordinates, identities, supplier assignments and SKU classifications. None is an
observed price, route, demand estimate or real business identity. All operating
sensitivities below are **N** (not tested); M7 is the sensitivity milestone.
YAML anchors inherit the same assumptions, not independent source observations.

Supplier coordinates reuse their respective assumed metro coordinates below.
Lead means/CVs describe pre-discretization processing plus travel once a lane is
built. Delays add fixed days independently per order-day/lane draw.

| Supplier / assumed metro | Price × SKU cost | Processing mean days / CV | MOQ units | Capacity units/day | Delay probability / days | Source |
| --- | --- | --- | --- | --- | --- | --- |
| S1 / Delhi NCR | 1.15 | 2 / 0.1 | 10 | 12000 | 0.01 / 2 | ASSUMPTION: reliable, premium |
| S2 / Mumbai | 0.90 | 8 / 0.2 | 100 | 12000 | 0.05 / 3 | ASSUMPTION: cheap, slow |
| S3 / Kolkata | 0.90 | 4 / 0.7 | 50 | 12000 | 0.10 / 4 | ASSUMPTION: cheap, variable |
| S4 / Bengaluru | 1.00 | 1 / 0.05 | 5 | 1500 | 0.01 / 1 | ASSUMPTION: local, small |

| Candidate DC | Latitude °N | Longitude °E | Retailer IDs / region | Source |
| --- | --- | --- | --- | --- |
| DC1 Delhi NCR | 28.6 | 77.2 | R01–R03 / 0 | ASSUMPTION: rounded synthetic metro site |
| DC2 Mumbai | 19.1 | 72.9 | R04–R06 / 1 | ASSUMPTION: rounded synthetic metro site |
| DC3 Bengaluru | 12.9 | 77.6 | R07–R09 / 2 | ASSUMPTION: rounded synthetic metro site |
| DC4 Chennai | 13.1 | 80.3 | R10–R12 / 3 | ASSUMPTION: rounded synthetic metro site |
| DC5 Kolkata | 22.6 | 88.4 | R13–R15 / 4 | ASSUMPTION: rounded synthetic metro site |
| DC6 Hyderabad | 17.4 | 78.5 | R16–R18 / 5 | ASSUMPTION: rounded synthetic metro site |
| DC7 Ahmedabad | 23.0 | 72.6 | R19–R21 / 6 | ASSUMPTION: rounded synthetic metro site |
| DC8 Pune | 18.5 | 73.9 | R22–R24 / 7 | ASSUMPTION: rounded synthetic metro site |

The three retailers per metro have coordinate offsets (+0.2°,0°), (0°,+0.2°),
and (−0.2°,0°), in ID order. B1/B2/B3/B4 use Delhi/Mumbai/Bengaluru/Kolkata with
(+0.1°,+0.1°) offsets and region IDs 0/1/2/4. These are assumed point locations,
not geocoded premises or guaranteed land coordinates. Region numbering is arbitrary.

| Parameter | Value | Unit | Source or ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- | --- |
| Each DC daily_capacity | 20000 | dispatched units/day | ASSUMPTION: shared SKU throughput | N |
| Each DC annual_fixed_cost | 2400000 | INR/year | ASSUMPTION: synthetic facility cost | N |
| Each DC holding_rate | 0.22 | fraction/year | ASSUMPTION: within plan's 20–25% band | N |
| Each DC handling_cost | 0.5 | INR/dispatched unit | ASSUMPTION: synthetic handling | N |
| Retail demand_scale / arrival_probability | 1 / 1 | multiplier / probability | ASSUMPTION: daily retail demand | N |
| Retail target_csl / shortage_penalty | 0.95 / 20 | fraction / INR/new unfilled unit | ASSUMPTION: CSL field follows base target; scenario target drives retail policy | N |
| B2B demand_scale / arrival_probability | 8 / 0.15 | conditional-size multiplier / daily probability | ASSUMPTION: independent lumpy orders | N |
| B2B target_csl / shortage_penalty | 0.98 / 50 | fraction / INR/new unfilled unit | ASSUMPTION: stronger contract service requirement | N |
| circuity | 1.3 | multiplier | ASSUMPTION: plan §4 | N |
| km_per_day | 500 | km/day | ASSUMPTION: effective transit speed | N |
| outbound_handling_days / outbound_lead_cv | 1 / 0.2 | days / ratio | ASSUMPTION: outbound transit variability | N |
| ltl_per_unit_km | 0.02 | INR/unit/km | ASSUMPTION: synthetic LTL rate | N |
| ftl_capacity | 5000 | units/truck | ASSUMPTION: homogeneous transport units | N |
| ftl_fixed_cost / ftl_per_km | 3000 / 20 | INR/trip / INR/km | ASSUMPTION: synthetic FTL rate | N |
| dc_order_cost / customer_order_cost | 100 / 20 | INR/order or fixed-Q lot | ASSUMPTION: setup costs; see network.md | N |
| customer_holding_rate | 0.22 | fraction/year | ASSUMPTION: uniform carrying rate | N |
| review_days | 7 | days | ASSUMPTION: periodic RS review interval | N |
| initial_stock_fraction | 1 | × upper policy target | ASSUMPTION: initial coverage, empty pipeline | N |

All SKUs below are assumed packaged-food transport units, not comparable physical
weights. `daily_mean` is nominal demand per scale-1 retail node; B2B scale applies
to conditional order size. Normal means are before zero clipping. The listed CV
multiplies the nominal mean and scenario `cv_scale`; gamma demand has nonnegative
support. A/B/C labels are a synthetic 6/8/6 master split, not M4's computed ABC classes.

| SKU / label | Unit cost INR | Daily mean units | CV | Pack / MOQ units | Supplier | Class / demand kind | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SKU01 Basmati rice | 150 | 20 | 0.2 | 10 / 10 | S1 | A / normal | ASSUMPTION |
| SKU02 Cooking oil | 140 | 20 | 0.2 | 10 / 10 | S2 | A / normal | ASSUMPTION |
| SKU03 Milk powder | 130 | 20 | 0.4 | 10 / 10 | S3 | A / normal | ASSUMPTION |
| SKU04 Breakfast cereal | 120 | 20 | 0.6 | 10 / 10 | S4 | A / normal | ASSUMPTION |
| SKU05 Instant coffee | 110 | 20 | 0.4 | 10 / 10 | S1 | A / normal | ASSUMPTION |
| SKU06 Tea | 100 | 20 | 0.6 | 10 / 10 | S2 | A / normal | ASSUMPTION |
| SKU07 Wheat flour | 60 | 10 | 0.4 | 5 / 5 | S3 | B / normal | ASSUMPTION |
| SKU08 Lentils | 60 | 10 | 0.2 | 5 / 5 | S4 | B / normal | ASSUMPTION |
| SKU09 Biscuits | 60 | 10 | 0.6 | 5 / 5 | S1 | B / normal | ASSUMPTION |
| SKU10 Noodles | 60 | 10 | 0.8 | 5 / 5 | S2 | B / normal | ASSUMPTION |
| SKU11 Pasta | 60 | 10 | 0.4 | 5 / 5 | S3 | B / normal | ASSUMPTION |
| SKU12 Tomato sauce | 60 | 10 | 0.6 | 5 / 5 | S4 | B / normal | ASSUMPTION |
| SKU13 Jam | 60 | 10 | 0.8 | 5 / 5 | S1 | B / normal | ASSUMPTION |
| SKU14 Peanut butter | 60 | 10 | 0.2 | 5 / 5 | S2 | B / normal | ASSUMPTION |
| SKU15 Specialty spice | 30 | 3 | 1.2 | 1 / 1 | S3 | C / gamma | ASSUMPTION |
| SKU16 Pickle | 30 | 3 | 0.8 | 1 / 1 | S4 | C / gamma | ASSUMPTION |
| SKU17 Soup mix | 30 | 3 | 1.2 | 1 / 1 | S1 | C / gamma | ASSUMPTION |
| SKU18 Baking powder | 30 | 3 | 1.5 | 1 / 1 | S2 | C / gamma | ASSUMPTION |
| SKU19 Custard mix | 30 | 3 | 1.2 | 1 / 1 | S3 | C / gamma | ASSUMPTION |
| SKU20 Dessert topping | 30 | 3 | 1.5 | 1 / 1 | S4 | C / gamma | ASSUMPTION |

The geography constant 6371 km is the spherical-Earth approximation (modeling
ASSUMPTION); 365 days/year follows the study calendar. Half-day mean correction for
gamma lead rounding is an approximation, not a fitted parameter. All inventory
targets derive from these YAML inputs and the formulas documented in `network.md`.

## M3 validation design

All values in `configs/m3_validation.yaml` are numerical experiment ASSUMPTIONs.
They do not calibrate the operating network.

| Parameter | Value | Unit | Source or ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- | --- |
| seed | 303 | seed | ASSUMPTION: reproducible root; child seeds via SeedSequence | N |
| pooling.sites / blocks | 4 / 30000 | sites / independent protection periods | ASSUMPTION: empirical quantile precision | N |
| pooling.lead_days | 4 | days | ASSUMPTION: fixed protection interval | N |
| pooling.daily_mean / daily_std | 100 / 10 | units/day | ASSUMPTION: normal demand with negligible clipping | N |
| pooling.target_csl | 0.95 | fraction | ASSUMPTION: protection-demand quantile | N |
| pooling.correlations | 0, 0.3, 0.6, 1 | rho | ASSUMPTION: V5 endpoint/interior sweep | Y |
| pooling.ratio_tolerance | 0.03 | absolute ratio error | ASSUMPTION: Monte Carlo acceptance margin | N |
| benchmark.dc_count | 8 | open DCs | Plan §5.9 performance workload | N |
| benchmark.replications / workers | 30 / 8 | replications / processes | Plan §5.9 | N |
| benchmark.single_seconds_limit / parallel_seconds_limit | 3 / 30 | seconds | Plan §5.9 | N |

Benchmark horizon is base-scenario warm-up plus measured days: 90 + 365 = 455.
The workload includes all 24 retailers **and** four B2B buyers. Each worker uses
one BLAS thread. Timing includes configuration, DC selection, demand/lead draws,
simulation and summary calculation; parallel timing also includes process startup
and shutdown. V5 is a demand-tail experiment, separate from the network benchmark.

## M4 forecasting and segmentation

All values in `configs/planning.yaml` are **ASSUMPTIONs**. They are illustrative
study controls, not parameters fitted to operating data. Forecasts and classes use
separate historical observations; the synthetic SKU-master A/B/C labels are ignored.

| Parameter | Value | Unit | Source or ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- | --- |
| forecast.method | ses | method | ASSUMPTION: baseline simple exponential smoothing | N |
| forecast.window | 28 | observations | ASSUMPTION: moving-average window and all methods' variance window | N |
| forecast.alpha | 0.2 | weight | ASSUMPTION: SES/Holt level weight | N |
| forecast.beta | 0.1 | weight | ASSUMPTION: Holt trend weight; unused by SES/MA | N |
| segmented | true | boolean | ASSUMPTION: default opt-in planner uses ABC–XYZ; false is the comparison arm | Y, E5 dry run |
| safety_factor_offset | 0 | z units | ASSUMPTION: unadjusted target initially; E5 searches offsets below | Y, E5 dry run |
| segmentation.abc_a / abc_b | 0.8 / 0.95 | cumulative annual-value share | Plan §5.5, 80/15/5 classes | N |
| segmentation.xyz_x / xyz_y | 0.5 / 1.0 | demand CV | Plan §5.5; exact boundaries belong to Y | N |
| cells.AX | QR / 0.98 | policy / target CSL | ASSUMPTION: plan's AX example | N |
| cells.AY | QR / 0.97 | policy / target CSL | ASSUMPTION: high-value moderate variability | N |
| cells.AZ | sS / 0.95 | policy / target CSL | ASSUMPTION: high-value lumpy demand | N |
| cells.BX | QR / 0.95 | policy / target CSL | ASSUMPTION: baseline continuous review | N |
| cells.BY | RS / 0.95 | policy / target CSL | ASSUMPTION: periodic review | N |
| cells.BZ | sS / 0.92 | policy / target CSL | ASSUMPTION: moderate-value lumpy demand | N |
| cells.CX | RS / 0.90 | policy / target CSL | ASSUMPTION: lower-value periodic review | N |
| cells.CY | RS / 0.90 | policy / target CSL | ASSUMPTION: lower-value periodic review | N |
| cells.CZ | sS / 0.85 | policy / target CSL | ASSUMPTION: plan's lower-service CZ example | N |

Classification conventions are ASSUMPTIONs: ABC includes each threshold-crossing
SKU in the preceding class and breaks ties by master order; XYZ uses daily demand
summed over all customers per SKU. Zero-demand SKUs become CZ. Population variance
uses ddof=0. Smoothing initializes from the first historical observation with zero
trend, clips predicted demand at zero, and keeps classes fixed during the run.
DC forecast initialization uses aggregated historical customer consumption as an
order-demand prior. During simulation, DCs observe actual incoming replenishment
orders. See [forecasting conventions](forecasting.md) for formulas and timing.

The service offset is added to the safety factor, not directly to CSL. B2B z floors
come from the already-documented customer targets. Nominal lead moments, MOQ/packs,
review intervals, prices and holding rates are inherited from the network master.

## M4 E5 dry-run design

All values in `configs/m4_validation.yaml` are numerical study **ASSUMPTIONs**.
This small experiment checks the comparison pipeline, not statistical inventory savings.

| Parameter | Value | Unit | Source or ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- | --- |
| seed | 404 | root seed | ASSUMPTION: reproducible training/calibration/evaluation streams | N |
| training_days | 180 | past days | ASSUMPTION: historical classification and forecast initialization | N |
| calibration_replications | 2 | runs/setting | ASSUMPTION: fast service-matching dry run | N |
| evaluation_replications | 2 | held-out paired runs | ASSUMPTION: pipeline validation, no powered inference | N |
| segmented_safety_offsets | −1.5, −1, −0.5, 0, 0.5, 1, 1.5, 2 | z units | ASSUMPTION: finite service-matching search | Y |
| service_tolerance | 0.005 | absolute fill-rate difference | ASSUMPTION: 0.5-percentage-point matching margin | N |

The base scenario supplies four DCs and 90 + 365 simulation days. Both arms receive
identical demand and lead draws within each paired seed. Training, calibration and
evaluation seeds are distinct SeedSequence descendants. Selection minimizes the
calibration service gap, with ties preferring the smallest absolute z adjustment.
Held-out seeds never influence that selection. No extra runtime dependencies are added.
