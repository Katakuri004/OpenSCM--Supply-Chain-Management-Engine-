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

## M5 bullwhip controls

All values in `configs/bullwhip.yaml` are **ASSUMPTIONs** for controlled mechanism
checks. They are not fitted buyer behavior or commercial terms. The existing
scenario booleans select the four causes and POS sharing only when these settings
are explicitly supplied. M5 uses continuous daily order-up-to replenishment as its
all-off control and uniform planning when forecasts are enabled.

| Parameter | Value | Unit / ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- |
| batch_days | 7 | days between synchronized reviews | Toggle on/off |
| batch_multiple | 4 | multiple of pack-rounded MOQ | Toggle on/off |
| promo_period | 28 | days between promotions | Toggle on/off |
| promo_days | 2 | days in each promotion | Toggle on/off |
| promo_start | 0 | first promotion day, including warm-up | N |
| discount_fraction | 0.1 | supplier discount fraction on dispatch date | EDLP on/off |
| forward_buy_days | 14 | forecast days added to promotional stock target | EDLP on/off |
| rationing_threshold | 0.9 | previous dispatch-fill threshold for gaming | Toggle on/off |
| rationing_gain | 1.5 | order-inflation multiplier per unit fill shortfall | Toggle on/off |
| smoothing_alpha | 1 | inventory-position adjustment weight | 1 versus 0.3 |
| lead_time_factor | 1 | transit and nominal lead-moment scaling | 1 versus 0.5 |
| vmi | false | coordinated POS/daily review/no-gaming package | On/off |
| edlp | false | remove promotion and purchase discount | On/off |

Post-demand smoothing targets S minus one forecast day. With no waiting orders,
upstream dispatch fill is one. Inflated orders are retained. VMI does not implicitly
disable promotions. Lead reductions round transit up to at least one day; nominal
lead variance scales by the factor squared and omits rounding/capacity waiting.
Holding valuation stays at base unit cost. See [mechanisms](bullwhip.md).

## M5 validation design

All values in `configs/m5_validation.yaml` are numerical validation **ASSUMPTIONs**.
The analytical bound comes from Chen et al. (2000), cited in [bullwhip](bullwhip.md).
Weekly measurement follows plan §5.6; the separate theory reference uses daily units.

| Parameter | Value | Unit / ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- |
| seed | 505 | SeedSequence root; independent theory/network branches | N |
| theory.daily_mean | 100 | units/day, IID Gaussian reference demand | N |
| theory.daily_std | 5 | units/day, small CV for the analytical setting | N |
| theory.lead_periods | 5 | daily review periods | N |
| theory.windows | 7, 14, 28 | moving-average observations | Y |
| theory.safety_factor | 1 | estimated lead forecast-error SD multiplier | z=0 identity also unit-tested |
| theory.warmup_days | 128 | discarded daily observations | N |
| theory.horizon_days | 16384 | measured daily observations per replication | N |
| theory.replications | 64 | independent columns of the theory stream | N |
| theory.relative_tolerance | 0.05 | maximum relative excess above Chen bound | N |
| theory.control_tolerance | 0.005 | absolute distance of known-demand BWE from one | N |
| network.training_days | 180 | independent historical days | N |
| network.replications | 3 | paired evaluation seeds, all cases share inputs | N |
| network.forecast_window | 14 | MA window; inherited alpha/beta unused by MA | N |
| network.smoothing_alpha | 0.3 | countermeasure inventory-position weight | Versus 1 |
| network.lead_time_factor | 0.5 | countermeasure transit scaling | Versus 1 |

The network experiment inherits four DCs and 90 + 365 days from `base_4dc.yaml`.
Complete measured weeks are anchored at warm-up end, leaving one trailing day out.
Historical, theory and network evaluation draws are separated; cases use common
random numbers without selecting seeds for observed outcomes. Direction gates use
each paired run, not just the average. The large promotion effect reflects synchronized
forward buying; the three replications do not establish calibrated effect sizes.

## M6 events and validation

All values in `configs/m6_validation.yaml` are **ASSUMPTIONs** for implementation
validation, not estimates of disruption likelihood or commercial exposure. Event
timing includes warm-up. Types, fields and target conventions follow plan §5.7;
operational magnitude semantics are documented in [resilience](resilience.md).

| Parameter | Value | Unit / source or ASSUMPTION | Sensitivity tested |
| --- | --- | --- | --- |
| seed | 606 | Root SeedSequence; two independent paired network streams | N |
| replications | 2 | Distinct seeds, each disturbed run repeated exactly | Reproducibility only |
| recovery_window | 7 | Days of volume-weighted fill; plan §5.7 | N |
| service_tolerance | 0.01 | Absolute fill difference, one percentage point; plan §5.7 | N |
| analytic_stock | 25 | Initial units at one customer/SKU; ASSUMPTION | N |
| analytic_daily_demand | 10 | Constant units/day; ASSUMPTION | N |
| analytic_days | 20 | Test horizon; ASSUMPTION | N |
| all event start_day | 120 | Simulation days from day zero; ASSUMPTION | N |
| all event duration | 21 | Consecutive active days; ASSUMPTION | N |
| supplier_outage target / magnitude | S4 / 1.0 | Remove all supplier dispatch capacity; ASSUMPTION | Event versus baseline |
| lead_time_multiplier target / magnitude | S4 / 2.0 | Double transit for new orders on supplier lanes; ASSUMPTION | Event versus baseline |
| demand_shock target / magnitude | R01 / 2.0 | Double customer demand across SKUs; ASSUMPTION | Event versus baseline |
| capacity_cut target / magnitude | DC1 / 0.75 | Remove 75% of DC dispatch capacity; ASSUMPTION | Event versus baseline |
| moq_change target / magnitude | S4 / 4.0 | Multiply supplied SKU/DC minimum orders by four; ASSUMPTION | Event versus baseline |
| price_promo target / magnitude | S4 / 0.2 | Discount dispatched purchases by 20%; ASSUMPTION | Event versus baseline |

The network runner inherits base four-DC geography, policy targets, 90 warm-up days
and 365 measured days. It uses fixed known-demand policies and backorders. Each event
is tested separately against the same undisturbed input streams; effects are not
required to have a particular sign. Capacity and MOQ events can be nonbinding.
Baseline and event runs have identical initial stocks and random draws.

The analytic case uses the first configured SKU/customer, clears other initial
stock and demand, gives that customer 25 units, and suspends its parent DC's dispatch
capacity for the whole 20-day test. Transit is fixed to one day, but the stopped DC
cannot send stock. This isolates the plan's on-hand/demand calculation in the actual
network engine. Derived node selection, zeroed test state, full cut and deterministic
transit are validation conventions, not operating parameters.

Additional conventions are ASSUMPTIONs: uniform daily depletion for fractional TTS;
SKU-specific affected descendants; first rolling recovery after a breach; day-close
TTR; multiplicative overlapping effects; order-date transit changes; dispatch-date
price changes; and no automatic forward buying for an event discount. A 1e-8-unit
shortfall tolerance suppresses floating-point residue. The extra contract fixture
uses a synthetic S1 outage at day 120 for 21 days with magnitude one; it is not
experiment evidence. M7 retains mitigation and ±20% sensitivity sweeps.

## M7 experiment design and mitigation assumptions

`configs/experiments.yaml` defines the full executable design. Values attributed to
the plan below are study-design choices, not fitted operating parameters. All other
values are explicit **ASSUMPTIONs**. `configs/m7_validation.yaml` copies every factor
and changes only evaluation replications to 2, screen replications to 2 and
confirmation replications to 3 for local acceptance. E1 retains the documented M2
benchmark configuration. [Experiment methods](experiments.md) define units and scope.

| Parameter | Full-design value | Unit / source or ASSUMPTION | Sensitivity exercised |
| --- | --- | --- | --- |
| seed | 707 | SeedSequence root; ASSUMPTION | Independent phase branches |
| replications | 30 | Runs/cell; plan §5.1 | Acceptance uses 2 |
| workers | 8 | Worker processes; plan performance hardware assumption | Serial versus parallel reproduction |
| warmup_days / horizon_days | 90 / 365 | Days; plan §5.1, inherited study defaults | Warm-up remains uncalibrated |
| training_days | 180 | Past days for forecasting/classification; ASSUMPTION | N |
| e2.targets | 0.9, 0.95, 0.98, 0.99, 0.995 | Target CSL fractions; endpoints from plan E2, interior grid ASSUMPTION | Y |
| e2.skus | SKU01, SKU07, SKU15 | One representative from each master A/B/C class; ASSUMPTION | Representatives only |
| e3.dc_counts | 1, 2, 4, 8 | DCs; plan E3 | Y |
| e3.demand_cvs | 0.2, 0.4, 0.8 | Nominal CV for every SKU; plan E3 | Y |
| e3.correlations | 0, 0.3, 0.6, 0.9 | Regional latent correlation; plan E3 | Y |
| e3.outbound_factors | 0.5, 1, 2 | Multiplier for outbound FTL/LTL charges; plan E3 | Y |
| e3.inbound_days | 3, 7, 14 | Unrounded supplier-to-DC base transit mean; plan E3 | Y |
| e3.screen_replications / confirm_replications | 10 / 30 | Runs/cell; plan E3 | Acceptance uses 2 / 3 |
| e3.break_even_fraction | 0.05 | Relative screen cost gap for near-break-even selection; ASSUMPTION | N |
| e4.sharing | false, true | POS sharing; plan E4 | Y |
| e4.lead_factors | 1, 0.5 | Transit scaling; plan E4 factor, levels ASSUMPTION | Y |
| Four E4 cause axes | false, true each | All 16 cells; plan E4 | Y |
| e5.calibration_replications | 5 | Separate runs/candidate; ASSUMPTION | N |
| e5.offsets | −1.5, −1, −0.5, 0, 0.5, 1, 1.5, 2 | z adjustments; ASSUMPTION | Y |
| e5.service_tolerance | 0.005 | Absolute blended fill gap, calibration and evaluation; ASSUMPTION | Matching status reported |
| e6.events_config | configs/m6_validation.yaml | Existing six-event synthetic study and recovery settings | All six events |
| e6.sensitivities | demand, capacity, lead, holding | OAT variables; ASSUMPTION | Y |
| e6.sensitivity_factors | 0.8, 1.2 | Multipliers; ±20% from plan E6 | Y, plus unchanged reference |
| mitigations.none | empty settings | Zero buffer, no backup, no expedite; ASSUMPTION | Reference |
| mitigations.stock_buffer.buffer_days | 7 | Nominal demand days added to stock and policy targets; ASSUMPTION | Versus none |
| mitigations.expedite.expedite_factor | 0.5 | All-lane transit multiplier; ASSUMPTION | Versus none |
| mitigations.expedite.expedite_unit_cost | 20 | INR per unit dispatched on each lane; ASSUMPTION | Versus none |
| mitigations.dual_sourcing.backup_suppliers | S1→S2, S2→S1, S3→S1, S4→S1 | Reactive backup mappings; ASSUMPTION | Versus none |

Internal mitigation defaults are buffer_days=0, expedite_factor=1,
expedite_unit_cost=0 and an empty backup mapping. These neutral defaults are
ASSUMPTIONs meaning no mitigation. In the backup arm, supplier prices, lane distances,
lead uncertainty and shared throughput come from the existing documented network
master; only unfilled supplier orders are redirected. Backup capacity is considered
after primary commitments. No new backup MOQ, reservation or qualification charge is
modeled. Buffer initial inventory is not newly charged as purchase expenditure;
ongoing holding charges still apply. Expedite premiums apply to every dispatched
lane in both event and undisturbed runs. These are modeling limitations, not free
operating capabilities proven by the experiment.

Statistical conventions follow plan §7: 95% two-sided Student t intervals and
matching-seed paired differences. Nulls are omitted with missing counts retained;
intervals are unavailable for fewer than two valid observations. Marginal service
costs use adjacent target settings and achieved percentage-point increases; null is
reported when the achieved increase is nonpositive. No multiplicity adjustment or
business-decision threshold is assumed.

Parquet conventions are implementation choices: version 2.6, no compression, plain
encoding, 65536 rows per row group and stable field/row order. They introduce no
scenario economics. The dependency lock records the versions for exact byte-repeat
checks. Changes in library versions or hardware require rerunning those checks.

## M8 API limits, accounting and acceptance requests

`configs/api.yaml` contains local-service limits and the additional accounting
assumptions. Resource limits are engineering **ASSUMPTIONs**, not operating data.
They constrain a single server process; they are not a deployment capacity claim.

| Parameter | Value | Unit / source or ASSUMPTION |
| --- | --- | --- |
| max_replications | 30 | Runs/request; local limit, aligned with plan §5.1 |
| max_horizon_days | 730 | Measured days/request; ASSUMPTION |
| max_warmup_days | 365 | Warm-up days/request; ASSUMPTION |
| max_pending_runs | 4 | Queued/running jobs; ASSUMPTION |
| workers | 4 | Maximum replication worker processes/job; ASSUMPTION |
| training_days | 180 | Historical demand days for optional forecasting; inherited M4 ASSUMPTION |
| days_sales_outstanding | 30 | Days; synthetic receivables ASSUMPTION, uncalibrated |
| days_payables_outstanding | 30 | Days; synthetic payables ASSUMPTION, uncalibrated |
| experiment_page_size | 1000 | Rows/default response; ASSUMPTION |
| experiment_page_limit | 5000 | Rows/maximum response; ASSUMPTION |
| cors_origins | localhost:5173, 127.0.0.1:5173 over HTTP | Local browser development origins; engineering ASSUMPTION |

Cash-to-cash is DIO + DSO − DPO, so the configured equal 30-day terms cancel.
No receivables/payables ledger or customer payment behavior is simulated. The
365-day annualization and weekly seven-day BWE grouping follow the existing study
calendar. The existing 1e-8-unit tolerance defines service shortfall/backlog flags.
Receipt-to-receipt CSL, daily demand-line OTIF, base-value inventory turns and
customer-only network service are explicit measurement conventions described in
[API definitions](api.md), not additional fitted parameters.

`configs/m8_validation.yaml` defines the saved acceptance requests. Every value is
an **ASSUMPTION** for implementation verification, with no operational recommendation.

| Parameter | Value | Purpose |
| --- | --- | --- |
| seed | 808 | SeedSequence root for training and paired replications |
| replications | 2 | Minimum count for a paired interval and background-run check |
| warmup_days / horizon_days | 90 / 365 | Days; existing plan §5.1 study window, not newly calibrated |
| alternative_dc_count | 2 | DCs; compare against the existing four-DC preset |
| node / sku | R01 / SKU01 | Existing customer and SKU for inspector time series |
| query | retailers with fill rate >= 0% | Match all retailers with defined final-day service |
| experiment / experiment_limit | E2 / 3 | Existing evidence and small pagination check |

Public request defaults are `preset=base_4dc`, `seed=0`, `replications=1` and all
four options false: known-demand, uniform, backorder behavior. These are neutral
API ASSUMPTIONs; operational factors inherit the preset YAML unless overridden.
Seeds are restricted to unsigned 32-bit integers for the documented seed interface.
Port 8000 in examples is a local transport convention. Synthetic contract fixture
values demonstrate serialization only; reported M8 results come from saved runs.
