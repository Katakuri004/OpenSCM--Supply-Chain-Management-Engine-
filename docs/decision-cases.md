# Decision cases · E4

OpenSCM is organised around an operating decision: question → controlled conditions
→ paired evidence → recommendation. Decision cases are the persistent investigation
that ties the model builder, Planning Lab, learning sandbox and live inspectors
together. The home route and `?view=cases` open the case library.

## Run an investigation

1. Start from one of the ten canonical learning questions. The default is the
   dispatch bottleneck case. Templates reuse the documented synthetic inputs;
   they do not supply a prediction or a validated operating recommendation.
2. In **Brief**, name the case, state its question and assumptions, record a
   prediction and choose at least one acceptance goal. Goals support a minimum
   immediate fill fraction, maximum operating landed cost in INR and maximum days
   of inventory. Blank goals are intentionally unassessed.
3. In **Alternatives**, edit condition A or B. Seed, replication count, warm-up and
   measured horizon stay aligned. Other assumptions remain condition-specific.
   Copy A into B, load a saved scenario, or validate a full condition JSON document.
   Paired conditions must retain the same ordered supplier, DC candidate, customer
   and SKU identities. Changing routing, economics, capacity or open DCs is allowed.
4. Save the case and run the saved comparison. The launch retains an immutable
   revision snapshot, including prediction, goals, assumptions, notes and both
   complete requests. Unsaved edits cannot be launched.
5. In **Evidence**, select an execution. KPI means and 95% t intervals, paired B−A
   differences, reconciled costs and provenance come from actual engine outputs.
   The execution snapshot is shown separately from the current editor revision.
   Inspect A or B in Control Tower with the case/execution context in the URL.
6. In **Decision**, record observations, limitations and a recommendation. Save,
   export a readable Markdown brief, or fork the definition to investigate a remedy.
   Restoring an old definition creates a draft; saving creates another revision.

An interval entirely meeting a criterion yields **Meets goal**; an interval entirely
breaching it yields **Misses goal**; an overlap is **Uncertain**. One replication
yields **More replications needed**. Missing metrics remain unavailable. These are
per-metric simulation indicators, not joint confidence, causal proof, independent
validation or real-world guarantees. Different horizons change total costs; goals
must be calibrated to the chosen units and window.

## Connected tools

- **Learning:** “Save full decision case” copies both current conditions, goal,
  prediction and reflection. Matching completed results are attached only if their
  immutable requests and current source fingerprints agree. An attachment records
  the notebook at attachment time; it cannot certify a pre-run prediction. Changed
  drafts save without attaching stale results. The original browser notebook and
  legacy “Save B in Planning Lab” action remain available.
- **Planning Lab / builder:** start a new case from a full request, or explicitly
  load/update the selected condition of the active case. Updating a condition also
  aligns the shared experiment design in the other condition; its operating
  assumptions remain unchanged. Server validation rejects incompatible masters.
  Make a separate case for a different master population. Explicit load actions
  replace the tool draft, so save existing work first.
- **Control Tower / operations:** opening a case result selects its actual live run.
  Returning to the case preserves the execution ID. Standalone runs and recorded
  examples are labelled separately from case evidence.
- **Analytical labs / playbooks / learning:** these retain their own reference or
  session experiments. An active-case banner labels them as reference examples;
  they do not silently become charts of the active case.

## Persistence, recovery and portability

Definitions, revision history, execution snapshots, comparison/KPI/provenance
evidence and condition B representative diagnostics live in new SQLite tables in
`data/portfolio.sqlite3` (beside a custom run root when configured). Existing
scenario and execution tables are preserved. Back up this database **and** the raw
run directory if daily arrays are required. Evidence is captured when a case job
finishes and can also be captured when history is read after a shared cached job
finishes. Pending or failed jobs do not have fabricated evidence.

Clearing raw run artifacts leaves completed archived comparisons readable. Daily
inspectors require raw cache artifacts and are disabled when these are unavailable.
Persisted evidence is immutable even when notes, requests or goals are later edited.
The library displays all cases; execution history lists the latest 50 launches.
Older executions remain stored and can be fetched by their known execution IDs.

Unsaved definitions have best-effort, browser-local recovery by case ID. Recovery
is explicit and server-validated. A stale recovered revision cannot overwrite a
newer server revision: save returns a conflict. Export the draft before discarding
and reloading the saved definition. Storage errors leave the server workspace usable.
The URL retains case, execution and selected condition; it is not a draft backup.

“Export saved case” exports the current saved definition plus selected completed
evidence (or the latest available evidence). It does not export unsaved edits;
“Export draft” does. Version 1 packages are limited to 2 MB on import. Imports create
a new case and retain supplied evidence as an explicitly unverified, read-only
archive. Imported run IDs are never adopted as local execution ownership. An archive
is inspectable evidence, not a signed certificate or a backup of raw daily arrays.
Forking copies the current definition, not the source case's executions.

## Contract and API changes

Additive models: `DecisionCaseDraft`, `DecisionCaseUpdate`, `SavedDecisionCase`,
`CaseGoals`, `CaseExecution`, `CaseEvidence`, `CaseDetail`, `CasePackage` and
`AttachCaseRuns`. Five exported schemas, their fixtures, OpenAPI and TypeScript
client are regenerated together. Existing run/scenario contracts are unchanged.
Evidence validates ordered run IDs, requests, replication counts and shared streams.
Numeric defaults are normalised before calculating new cache identities so a saved
JSON round trip cannot change the identity of the same request. Old run directories
remain readable by their existing IDs.

`GET/POST /cases`, `POST /cases/validate`, `POST /cases/import`,
`GET/PUT /cases/{identity}`, `GET .../revisions`, `GET/POST .../runs`,
`POST .../attach`, `GET .../runs/{execution}/evidence` and `GET .../package` expose
the workflow. Updates and launches require the current revision; stale requests
return 409. A paired reservation checks queue capacity for both conditions before
reserving either. Cached runs can be reused without altering their outputs.

Windows status polling retries transient sharing/access locks up to five attempts
(10/20/30/40ms waits). Other errors and exhausted retries propagate; a failed read
is never converted into a successful run. This mirrors the existing bounded
status-write handling and protects case/scenario polling during atomic replacement.

This is a private local-server workspace, not multi-tenant enterprise access control.
E4 does not implement E5 decision-time stage replay, E7 bounded failure search,
independent validation batches, instructor grading or a reviewed benchmark registry.
Those features must build on these case snapshots and retain explicit search/model
limits. There is no simulated “Find a failure” action in this milestone.
