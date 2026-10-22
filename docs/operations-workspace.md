# E1 operations simulation workspace

OpenSCM is an open-source simulation workspace for exploring realistic operating
questions with synthetic inputs. The interface supports a planner's workflow:
observe service exposure, investigate inventory, configure a scenario and compare
paired evidence. Its enterprise-oriented structure does not imply a live enterprise
system or calibrated business forecasts.

## Observe and investigate

The default `/?view=overview` uses the existing recorded run. It shows network
size, a site-health mosaic, recent exception trends, a site/day history heatmap
and investigation links. Cards explicitly distinguish measured-horizon KPI means
from first-replication observations on the selected simulation day.

`/?view=exceptions` ranks stockout/backlog sites first, low-cover sites next and
unavailable-cover sites last. Suppliers are excluded because raw material is
unbounded in the model. A site with stockout/backlog is counted once, even when
its aggregate cover is above the review threshold; SKU imbalance can cause both.
Missing cover is unavailable, never zero. Seven days is a review assumption,
not an automatic replenishment instruction. The history shows up to 28 measured
days ending at the selected day; warm-up snapshots are labelled and do not
contribute to a measured trend.

Search facilities, filter echelon/review state, export the filtered CSV or open a
site in Control Tower. Review marks persist in this browser for a specific
run/day/site. They do not resolve shortages, change the engine, synchronize across
users or constitute an audit log. Storage failures are visible and leave session
state usable. Network KPI means do not change when exceptions are reviewed.

## Run realistic operating exercises

`/?view=playbooks` contains eight explicit exercises, with categories, an operating
question, event timing, assumptions and metrics to examine:

| Exercise | Operating stress |
| --- | --- |
| Demand surge | Local customer demand uplift plus constrained DC throughput |
| Supplier interruption | Complete temporary loss of a supplier's dispatch capacity |
| Transport delays | Longer supplier transit combined with reduced handling capacity |
| DC constraint | Reduced dispatch capacity at one distribution centre |
| Higher MOQ | Larger supplier minimum lots and inventory/ordering trade-offs |
| Promotion | Purchase discount plus a separate, assumed demand uplift |
| Consolidation | Four regional DCs versus one demand-weighted central location |
| Combined stress | Partial outage, transit delay and demand uplift together |

Configure opens Scenario Lab in Live API mode; start the Python service following
[frontend setup](frontend.md). No live business data is required. Edit A/B DC
counts, six event magnitudes, shared event timing, root seed and replication
count. Replenishment choices include (Q,R), (s,S), periodic (R,S) and order-up-to.
Planning can use known-demand control, historical forecasting or ABC–XYZ policy
segmentation; segmentation supplies its own policy map. Demand shortfalls can be
backordered or lost. Shared policy/planning assumptions apply to both A and B;
event sliders apply only to B. Event targets remain visible, including a replacement
if the chosen B network closes DC1.

Submit to run the actual engine. Inspect matching-seed B−A cost/service deltas,
download original submitted requests plus statuses/comparison JSON, or open B's
health/inventory in Control Tower. Changing controls marks results as belonging
to the previous submitted configuration until rerun. This prevents stale results
being attributed to edited inputs. Re-entering a playbook restores its configured
starting assumptions; it is not a saved portfolio of personal experiments.

Use Network Design, Inventory Lab, Bullwhip Lab and Resilience for the existing
recorded factor sweeps and mitigation evidence. Single playbook runs do not
automatically compute M6 TTS/TTR or isolate simultaneous event effects. Physical
behavior, accounting, forecast and service definitions retain the limits in
[simulation](simulation.md), [API](api.md) and [assumptions](assumptions.md).

## Source, reproducibility and scope

`configs/workspace.yaml` is canonical for the catalog, review threshold and history
window. `python web/scripts/export-workspace.py` generates the typed browser
catalog; `--check` verifies drift. Python tests compare YAML/JSON, validate every
RunRequest and pass every playbook through actual API scenario/target reservation.
No response contract changes are introduced by this milestone. Existing API
request types already support the exposed policies and planning controls.

Browser checks reconcile stockout counts with the health fixture, exercise scoped
local reviews, run a combined playbook with periodic/forecast/lost-sales options,
verify submitted requests, compare evidence and navigate to the actual result.
Keyboard command search, narrow-screen navigation and screenshot baselines are
also checked. `npm run record:evidence --prefix web` records current browser
results, the actual playbook requests/comparison and source/output hashes under
`docs/evidence/e1/`. Earlier milestone evidence retains its historical scope.

The grouped sidebar, keyboard search (Ctrl/Cmd+K), responsive navigation, semantic
tables and source-labelled visualizations support enterprise-style planning.
Apache-2.0 licensing and contribution guidance support open-source use. Live ERP
feeds, collaborative approvals, authentication/SSO, access control, durable shared
audit trails and distributed scheduling are not implemented. Deployment and broad
performance/accessibility audits remain M11 work.
