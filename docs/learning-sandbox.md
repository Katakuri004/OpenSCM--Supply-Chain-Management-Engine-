# Learning sandbox

Open `/?view=learning`. This is an end-to-end supply-chain experiment workspace:
understand an operating question, predict, design A/B, simulate, inspect evidence,
reflect and design the next experiment. It uses the existing engine. Lesson text
does not supply an expected numerical outcome or mark a student right or wrong.

## Student workflow

1. Choose one of ten concepts: service targets, variability, DC pooling/design,
   forecast responsiveness, dispatch capacity, supplier reliability, supplier
   interruption, initial buffer protection, seasonal demand or shortage treatment.
2. Read the mechanism and explicit synthetic assumption. Write a prediction and
   identify what observation could contradict it.
3. Inspect the changed-input table. Expand **Customise A and B assumptions** to edit
   either condition using the full planning controls. Set a common root seed and
   replication count; the match-window action copies A's experiment window to B.
   Event days must still fit the run. The API validates both requests before launch.
4. Run the pair. Status updates while background replications execute. The result
   table shows A and B means, B−A, a paired 95% t interval and a direction/uncertainty
   indicator. The editable fill-rate goal is a learning criterion; target CSL is
   a different policy input. A mean meeting the goal is distinguished from its
   entire interval meeting the goal. Cost direction is not a universal ranking.
5. Explain cost components, then inspect B's first-replication SKU, facility and lane
   contributors. Open **Visual explorer**, select A or B and trace a facility/SKU
   across days. Choose trends, daily bars, distributions or metric relationships.
   Change facilities and SKUs; compare the same observations in the two sources.
   The network/policy link opens the actual selected run in Control Tower.
6. Record evidence, uncertainty, a mechanism and a proposed next experiment. Export
   the notebook and evidence JSON. It separates the current draft from submitted
   requests, prediction at launch, run statuses, replicated results and both complete
   model provenance documents. Changed drafts explicitly mark older results stale.
   Use **Save B in Planning Lab** for a persistent named configuration and notes;
   that action saves the current B draft, and does not manufacture a launch history.

Notebook prediction/reflection text is saved per lesson in this browser, with
graceful handling of damaged/unavailable browser storage. Inputs/results remain
in the open lesson session; export before switching lessons or reloading. Tabs
preserve the open experiment. Notes are not synced student accounts or grades.
API run artifacts remain server-cached and can be reopened by completed run ID.

## What the visual explorer measures

Each series is day × one SKU × one facility from the **first replication**. It is
not a network total or a replication mean. The complete network health matrix and
replicated KPIs remain in Control Tower/Planning Lab. The recorded example includes
all recorded facilities but one SKU and the original five daily stock/service
series. New runs expose all configured SKUs and these ten daily series:

| Series | Unit / timing |
| --- | --- |
| on_hand | Closing physical stock, units; not the time-weighted inventory mean |
| on_order | Closing replenishment pipeline, units |
| backorders | Customer backlog plus pending upstream orders, units |
| fill_rate | Today's immediately served units / today's demand signal; fraction |
| days_of_cover | Closing on-hand / current planning demand estimate; days |
| demand | Customer demand at leaves; downstream replenishment orders at upstream facilities; units/day |
| immediate | Today's demand/order signal served that day; excludes later backlog clearance; units/day |
| orders | Replenishment orders placed upstream, units/day; suppliers have none |
| received | Shipment arrivals, units/day; excludes supplier production |
| forecast | Pre-demand estimate, units/day; null for known-demand policies and suppliers |

Demand/order signals are **not additive across echelons**. DC forecasts generally
observe downstream orders, while POS sharing can change the forecast signal.
Missing values remain gaps; zero is a valid observed quantity. Zero demand leaves
fill rate undefined. Explorer statistics are arithmetic means over available
daily values, not weighted aggregate service KPIs. Distributions use up to ten
equal-width bins (one for a constant series), excluding unavailable days; CSV
exports underlying observations. Relationship charts show same-day associations,
not causal effects. Day ranges must be ordered integers within the run; include
warm-up explicitly to investigate initialization. PNG/CSV export the visible chart
and its selected observations. Older caches without extended series return an
actionable rerun message, while their original series remain readable.

**Concept reference** explains daily event order and essential terminology, links
to the analytical EOQ/inventory/network/bullwhip/resilience/methodology labs, and
offers the parameter and assumption documents. The latter labs retain their own
recorded evidence provenance. API failure does not prevent reading the reference
or exploring the recorded example. Tabs support arrow/Home/End keyboard navigation.

## Instructor sequence and interpretation

Begin with physical stock versus inventory position and immediate service versus
backlog clearance. Move to the service-target lesson, then demand/forecast effects,
capacity/sourcing and disruptions. End with a defended network or mitigation
choice citing cost, service, inventory and uncertainty. Ask students to submit
the evidence JSON with their reflection and identify at least one model limit.
Inspect their actual submitted requests: a lesson title does not constrain edits.

Use one input change when isolating a mechanism. DC-count changes are intentionally
multi-mechanism: locations, assignments, inventory, fixed cost and freight change
together. Seasonal indices change annual volume as well as timing unless
normalised; known-demand targets do not anticipate peaks. Buffer days add initial
stock, not an adaptive replenishment target, and acquisition of initial stock is
excluded from operating cost. Warm-up can erode the buffer before measurement.
Common random numbers pair streams, not necessarily identical realised demand
when assumptions change. No direction of improvement is guaranteed.

The default two replications are a quick teaching screen, not adequate evidence
of precision. Increase replications, inspect intervals and warm-up sufficiency,
then confirm the preferred alternative on an independent root seed. Confidence
intervals describe random variation under the model, not empirical calibration
error. For real planning, follow [calibration and held-out validation](planning-lab.md).
This milestone does not add BOM/manufacturing schedules, multi-user courses,
instructor gradebooks, authentication or claims of enterprise deployment readiness.

## Maintaining lessons

`configs/learning.yaml` is canonical for requests and teaching content. Every
numeric request assumption is documented in [parameters](parameters.md). Export
with `python web/scripts/export-learning.py`; `--check` detects drift. Python
tests validate both requests against contracts and physical targets, and check
pairing/uniqueness. The generated browser JSON contains inputs, never invented
outcomes. Changes to supported daily evidence require the TimeSeries contract,
API/client and fixtures to change together.
