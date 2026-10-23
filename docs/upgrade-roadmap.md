# Next implementation modules

Proposed roadmap after the completed E1–E3 product expansions, dated 23 October
2026. E4 is now delivered as [persistent Decision Cases](decision-cases.md).
On 24 October the user prioritised E6, which is now implemented; the other
modules below remain planned. The subsequent user-requested E9
[interaction/motion polish](interaction-motion.md), delivered on 24 October, is a separate frontend milestone;
it does not complete M11's broader audit. Product E numbers
are separate from the M7 experiment identifiers. Follow `docs/plan.md` and ship
one milestone per task, beginning with tests.

The sequence strengthens both the student learning workflow and the operations
planning workflow. Reuse the engine, contracts, Planning Lab, Cytoscape, ECharts,
experiment runner and evidence exports. No new chart framework or model rewrite
is needed. Synthetic assumptions remain explicit throughout.

| Order | Milestone | Main outcome | Depends on |
| --- | --- | --- | --- |
| 1 | E4 — Persistent decision cases — implemented | Resume and share a complete investigation without losing work | Existing E2/E3 |
| 2 | E5 — Simulation replay and decision traces | Explain how a daily replenishment decision leads to a result | Existing E3; E4 for saved investigations |
| 3 | M11 — Delivery, accessibility and deployment quality | A reliable installation and accessible recorded demo | Existing frontend; E4/E5 included in verification |
| 4 | E6 — Visual supply-chain model builder — implemented | Configure a custom supported network without editing source YAML | Existing E2 persistence; M11 packaging remains pending |
| 5 | E7 — Experiment sweeps and decision frontiers | Compare many alternatives with budgets and uncertainty | E4; E6 for custom-network sweeps |
| 6 | E8 — Replenishment rules and ongoing inventory protection | Test operational policies beyond an initial-stock buffer | E5 traces; E7 evaluation |

## E4 — Persistent decision cases · implemented

Delivered as the shared question → conditions → evidence → decision workflow.
See [the case guide](decision-cases.md) for persistence, portable evidence, draft
recovery, tool handoffs and exact scope. The original acceptance brief follows.

**Problem:** E3 saves prediction/reflection text locally, but custom A/B inputs and
results belong to the open lesson session. Planning Lab stores scenarios and
launches, but does not yet preserve the entire learning investigation together.

Deliver a server-persisted workbook containing the lesson/version, question,
prediction, editable A/B drafts, submitted request snapshots, run references,
observations, reflection and completion state. Reopen it after reload or restart.
Keep drafts separate from evaluated snapshots so edits cannot relabel old results.
Add validated, versioned JSON import/export and duplicate-as-new. Export enough
evidence to interpret the workbook if its referenced server cache is unavailable;
mark unavailable runs clearly. An export is not a backup of every raw array.

The interface should provide a workbook library, save status, revision/conflict
messages, and a compact question → prediction → experiment → evidence → reflection
progress view. Progress describes work completed, not correctness. Offer an
explicit copy action for existing browser notes; do not silently delete them.

**First tests:** restart persistence, revision conflicts, lesson switching/reload,
draft-versus-submitted separation, malformed/unsupported imports, and missing run
artifacts. Browser test: customise a lesson, run it, leave, reopen and recover the
same inputs, notes and evidence references. Import an exported copy as a new workbook.

**Boundary:** a private local-server workspace. Accounts, instructor access and
shared ownership are separate work; do not imply that workbook IDs provide access
control. Add the workbook models, schemas, fixtures and generated client together.

## E5 — Simulation replay and decision traces

**Problem:** daily charts expose stock and order signals, but students cannot yet
inspect the complete inventory balance or the reason an order was placed.

Add a replay workspace for a selected run, replication, facility, SKU and day.
Start with the existing first representative replication. Show the six daily
stages with opening stock, receipts/production, demand, immediate service, backlog
clearance, dispatch and closing stock. Separately reconcile on-order quantities
and backlog/lost-sales quantities; these are different balances.

Expose the actual decision-time inventory position, effective forecast, policy,
review eligibility, thresholds/targets, raw proposed order, MOQ/pack rounding and
final placed order. Log the engine's decision values where necessary; do not
reconstruct a supposed decision from closing balances or nominal initial targets.
Show capacity/source constraints only where the engine supplies evidence.

Synchronise a stage diagram, inventory/order charts, event annotations and a
plain-language explanation. Include units, raw values and an exportable trace.
Playback replays saved evidence; changing an assumption creates a new request,
not an edit to a historical run. Older runs lacking traces offer a rerun action.
Bound optional trace capture to protect storage and simulation performance.

**First tests:** per-stage material balances, no-negative-stock invariants, logged
policy decisions versus actual orders, review-day/MOQ rounding, shortage treatment,
and missing historical traces. Browser test: follow a shortage through the daily
stages, inspect its order decision and export the same values. Measure capture
overhead against the existing engine performance budget.

**Boundary:** this explains recorded mechanisms. Establish the effect of an
alternative through paired experiments; do not label a trace as causal proof.

## M11 — Delivery, accessibility and deployment quality

Complete the existing milestone before expanding the model editor. Provide two
explicit modes: a recorded demo that needs no compute API, and a self-hosted live
application with persistent run/workbook storage. Document which student actions
need the live service. Retain original M11 static-demo/export and Docker acceptance
goals; resolve Next.js reference-document routes and live-only features explicitly
instead of assuming the whole application can be exported unchanged.

Include an installation path, configuration/health checks, storage backup/restore
instructions and actionable startup/queue errors. Verify that the packaged build
serves its contracts, fixtures and downloadable guides. Bind the live service
privately by default. Public/shared mutable compute requires an additional access
control and resource-isolation gate; a container alone is not enterprise readiness.

**First tests:** clean-install/container smoke tests, persistence across restart,
recorded mode without API access, keyboard-only lesson and planning workflows,
focus handling, chart/table alternatives, contrast and narrow-screen layouts.
Record performance and accessibility evidence; retain the original static-demo
Lighthouse target of at least 90 and the 100-node scrubbing check. Deployment
depends on the actual hosting environment being available.

**Boundary:** a real deployment-quality pass, with measured results. Multi-tenant
authorization, institutional login and instructor administration remain separate.

## E6 — Visual supply-chain model builder

Implemented ahead of the original sequence at the user's request. See the
[builder guide](network-builder.md) and [validation](validation.md) for delivered
behaviour and evidence. E4 is delivered; E5 and M11 remain separate pending milestones.

**Problem:** students can adjust many assumptions, but custom topology and master
data currently require source YAML changes and an API restart.

Introduce a versioned model snapshot for the supported supplier → DC →
retailer/B2B network. Provide facility and SKU tables plus a Cytoscape editor:
add/edit supported facilities, candidate DCs, sourcing assignments, coordinates,
capacities, SKU demand/cost/pack/MOQ fields and supported lane inputs. Use the same
model for the diagram and forms. Distinguish candidate facilities from those
opened in a scenario, and physical lanes from geographic display positions.

Start from the existing reference model or duplicate an imported model. Validate
IDs, units, references, supported echelon structure, reachable sourcing, capacity
bounds and scenario compatibility before saving/running. Explain changes to the
current fixed DC-count choices through coordinated contracts and engine callers.
Save the exact model snapshot with every run and compare source/parameter changes
visibly. Historical requests must keep their original interpretation.

**First tests:** round-trip import/export, invalid links/units, disconnected demand
nodes, unsupported network structures, source-model immutability and deterministic
runs against a small custom model. Browser test: build a supported small network,
run it, reload and inspect the exact saved model in its provenance.

**Boundary:** expose topology the engine can actually simulate. Manufacturing/BOM,
arbitrary cyclic networks and lateral transshipment need separate engine milestones.

## E7 — Experiment sweeps and decision frontiers

**Problem:** A/B comparisons teach one decision at a time, while planning often
requires screening several inventory, sourcing or distribution alternatives.

Build a bounded experiment designer over the existing M7 grid/statistics machinery.
Select supported factors and values, choose measured windows and replication
counts, and preview the exact case matrix and compute budget before execution.
Validate a configured case/replication limit; show an estimate as an estimate,
not a runtime promise. Persist job progress, completed cases and failed-case
messages. Reuse valid cached cases; support retry and stopping queued work without
discarding completed evidence.

Add service–cost–inventory scatter plots, paired-difference intervals, sensitivity
plots and small supported two-factor heatmaps. Identify non-dominated **tested**
alternatives under explicit service constraints; do not call the best grid cell
a global optimum. Separate shared-seed screening from independent-seed confirmation.
Export the experiment definition, case outcomes, failures and provenance.

**First tests:** matrix expansion/limits, stable case identity and seeds, restart
and partial-failure handling, cache reuse, paired interval correctness, and frontier
selection with missing/infeasible outcomes. Browser test: run a small grid, inspect
an actual case in replay, and export the displayed trade-off data.

**Boundary:** sensitivity is evidence over tested settings. One-factor-at-a-time
results do not establish interactions or robustness to untested assumptions.

## E8 — Replenishment rules and ongoing inventory protection

**Problem:** the current mitigation buffer adds initial stock. It is not an ongoing
coverage target, and should not be presented as one. Several replenishment inputs
are inherited from configuration rather than authored by facility/SKU in the UI.

Add explicit, bounded facility/SKU or class-level replenishment rules using the
existing supported policy families. Cover review calendars, target service,
order limits and an ongoing coverage/safety-stock rule with clear precedence and
units. Specify exactly when targets use updated demand estimates and how targets,
lead times, MOQ/pack rules, capacity, backlog and sourcing interact. Preserve the
existing known-demand and initial-buffer semantics as separate choices.

Use E5 traces to show the effective daily rule and E7 to compare policies under
the same operating conditions. Include guided exercises contrasting an initial
buffer with sustained replenishment protection and testing review frequency
against holding, ordering, shortage and freight costs. Record all new synthetic
parameters and excluded costs; include acquisition effects explicitly if a new
cost convention is introduced.

**First tests:** rule precedence, review calendars, target timing without future
demand leakage, MOQ/pack/order limits and inventory/cost invariants. Preserve
legacy default behaviour. Browser test: configure two rules, inspect their actual
daily decisions, and compare replicated cost/service/inventory evidence.

**Boundary:** policy evaluation, not automatic purchase execution or a claim of
optimal replenishment. Production scheduling and perishable inventory remain
separate model extensions.

## Release discipline and later work

Each milestone starts with its failing tests, documents numeric defaults in
`docs/parameters.md`, updates contracts/models/fixtures/callers together when
needed, and ends with `python -m scm.check`, reviewed browser evidence and a source
manifest. Preserve prior evidence. Avoid placeholder buttons or invented outcomes.
Estimate implementation effort after inspecting that milestone's touched code;
this sequence is a priority order, not a delivery-date commitment.

After these modules, choose the next direction from demonstrated use: instructor
assignments and assessment rubrics; authenticated shared workspaces with access
control and audit records; or a specific new operations mechanism such as shelf
life or manufacturing/BOM. Do not combine all three into one milestone. M12's
case study/report should describe measured, delivered capabilities and remain a
separate task. E4 is delivered. Continue next with **E5: decision replay and traces**,
then build bounded failure search and independent validation on case executions in E7.
