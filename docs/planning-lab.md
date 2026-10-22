# E2 configurable planning lab

The Planning Lab connects named scenarios, operating assumptions, replicated
simulation, paired comparisons and traceable result diagnostics. Open
`/?view=portfolio` with Next.js and the local Python API running. It uses the
current API server's workspace, independently of the recorded-study selector.

## Planning workflow

1. Create a scenario, state the operating question and acceptance criteria in
   notes, and set a seed, replications, warm-up and measured horizon.
2. Configure demand variability/correlation, monthly seasonal indices, facility
   capacity, service targets, replenishment policy and forecast assumptions.
3. Select a supplier to change lead-time mean/CV, delay probability/duration,
   daily throughput, price multiplier and MOQ. Configure a distinct reactive
   backup supplier where required. All untouched fields inherit the source YAML.
4. Set safety-buffer coverage or expediting assumptions. Use advanced request JSON
   for independent event timing/targets, SKU demand/CV/cost/pack/MOQ/supplier
   overrides or other typed RunRequest options. Validate and apply the JSON before
   saving. The server validates actual scenario bounds, model references and limits.
5. Save and launch the revision. Save-as-new creates an alternative without
   rewriting the baseline. Scenario Lab can also save its current draft B here.
6. Use a completed baseline as A, launch the alternative as B, then compare cost,
   fill, inventory days and turns. Paired comparisons require identical replication
   seeds, day windows, model/config source fingerprints and package versions.
7. Inspect SKU shortfalls, facility cost/capacity and lane freight, investigate a
   customer in Control Tower, and export the requests, comparison, diagnostics
   and model provenance. Confirm a promising policy on independent seeds.

## Persistent definitions and immutable launches

SQLite stores scenarios in `data/portfolio.sqlite3` beside the run cache. The
database is server-local and shared by clients of that server; it is not browser
storage or an authenticated multi-tenant service. Notes and requests are bounded
and validated. Revision numbers use an atomic conditional update; stale edits
return 409. The editor preserves the unsaved draft and offers an explicit reload.
Save changes before launching so displayed inputs and executed revisions agree.

Every launch records an immutable scenario name, revision, notes, request and UTC
launch timestamp. Status is resolved from run artifacts when history is read.
Changing a saved definition does not alter earlier launches. Repeat request uses
that execution's original request/notes with the current engine/config fingerprints.
A duplicate request can reuse an immutable cache entry; change seed for independent
draws. Original model snapshots remain downloadable. Missing cache artifacts are
reported as unavailable; request history remains and can be rerun. Export scenario
definitions as JSON and include the SQLite database in workspace backups using
SQLite-safe backup procedures or with the API stopped.

## Model behavior behind the controls

- Monthly indices affect actual sampled demand. They repeat on the existing
  365-day non-leap calendar beginning at model January, including warm-up. They
  are not automatically normalized, so changing the annual weighted average also
  changes demand volume. Nominal known-demand policy targets retain their existing
  base means; seasonal peaks can still cause shortages.
- Demand CV and regional correlation retain M2/M3's distributions and common random
  streams. B2B orders keep the documented compound arrival process. SKU overrides
  change the underlying model inputs, rather than rescaling displayed results.
- Forecast methods are moving average, SES and Holt. Window affects moving average;
  alpha/beta affect the applicable smoothing methods. Errors use the forecast
  logged before the current day's demand, avoiding a same-day fit. Historical
  training uses the synthetic calendar convention; real observations need proper
  calendar alignment. Segmentation supplies its existing M4 policy map.
- Supplier delay probability adds delay days to the sampled transit draw. This
  models delivery reliability; persistent outages are explicit events. Capacity
  factors change available DC dispatch throughput. The model has daily aggregate
  capacity, not labor shifts, dock schedules or within-day vehicle routing.
- Backup sourcing uses remaining selected-supplier capacity after primary dispatch,
  with that supplier's price. SKU primary suppliers can also be changed explicitly.
  Buffers add nominal coverage to targets and initial stock; initial acquisition
  remains outside measured purchase expense. Expediting scales transit and charges
  a standing per-unit premium. These are M7 mechanisms exposed through the API.

## Explain observed contributors

Diagnostics use the first replication and measured days only, while comparison
tables use all replications. These different grains are labelled explicitly.

| Diagnostic | Definition and reconciliation |
| --- | --- |
| SKU shortage units | New customer demand minus immediate service, summed across customers; backorders are not counted again each day |
| SKU inventory value | Mean time-weighted on-hand at base SKU cost across inventory sites |
| Forecast WMAPE / bias | Sum absolute / signed pre-demand errors divided by total customer demand; undefined denominators remain null |
| Facility ledger cost | Actual eight-account costs recorded at the site; totals equal the representative network ledger |
| Facility utilization | Total dispatched units / available source capacity after event cuts; null for customers or zero capacity |
| Lane freight | Actual daily FTL/LTL consolidation cost plus expediting premium; sum equals inbound + outbound freight |
| Closing lane transit | Units still in transit at the end of the simulated horizon |

SKU and customer-facility shortage totals reconcile. SKU and facility inventory
values reconcile. Shared DC/freight/ordering costs are not arbitrarily assigned to
SKUs. A high-utilization or expensive site is an observed contributor; establish
the impact of changing it through a matched comparison. Simultaneous changes
are evaluated together and do not isolate each individual cause.

Provenance includes requests, scenario, effective network/seasonal/planning
snapshots, API settings, source checksums, package versions and replication/training
seeds. The effective input snapshot is an opaque JSON evidence document, not a
replacement for public typed request contracts. Historical runs remain readable;
older runs without diagnostic artifacts require rerunning, and older provenance
can have no effective-input snapshot.

## Moving from a synthetic exercise to an operating decision

Map the real echelon topology, customer/SKU units, pack/MOQ rules, costs and lead
definitions to the model first. Estimate demand seasonality, variability,
correlation and supplier delay distributions from suitable observations; account
for censored sales during stockouts. Record their period, source and uncertainty.
Review holding/shortage costs, starting inventory valuation, review calendars and
backup/expedite charges with the operating owner. Unsupported mechanisms require
a model change rather than a cosmetic parameter adjustment.

Validate against a held-out period and compare service, inventory, dispatch and
cost by SKU/site, not only network averages. Select warm-up and horizon to remove
initial-stock effects and cover relevant seasonal cycles. Use the default two-run
setup for software exercises, then choose replication counts from observed
variance and the decision tolerance. Inspect intervals and missing outcomes.
Screen candidate policies on shared seeds, confirm on independent seeds, and
pilot with the operating team before using a simulated result as an instruction.
Save each revision, the acceptance criterion and its evidence.

Current scope retains the synthetic FMCG network configuration, daily time steps,
fixed geography/site counts, upstream raw-material assumptions and documented cost
conventions. Custom topology/economics can be authored in source YAML and require
an API restart. The interface does not establish empirical calibration, autonomous
procurement, SSO/RBAC, shared approvals or production deployment certification.
Deployment and broad performance/accessibility work remain M11.
