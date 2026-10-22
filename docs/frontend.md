# M9 Next.js Control Tower

Run `npm ci --prefix web`, then `npm run dev --prefix web`. Open
[localhost:5173](http://localhost:5173). The default Recorded study works without
Python running. It uses saved simulation output, not fabricated dashboard values.
E1 makes Operations overview the default entry point; use `/?view=tower` for the
original Control Tower. See [operations workspace](operations-workspace.md) for
the visual overview, exception workbench and synthetic operating playbooks.

For Live API, start the Python service from the repository root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000
```

Switch the source selector to Live API, choose the preset, seed and replication
count, then Run. One replication is synchronous; multiple replications show queued/
running states and poll until complete. Errors remain visible and runs can be
resubmitted. Next.js rewrites `/api` to port 8000 in development and production.
Set server-side `SCM_API_URL` before building to change the upstream. Set
`NEXT_PUBLIC_API_URL` before building to call an API directly from the browser;
that server must permit the browser origin through CORS.
This is local development, not a deployed static demo or an authenticated service.

## Interface and observations

- The shell uses Next.js App Router, React 19, strict TypeScript, Tailwind and local shadcn/ui Button
  and Sheet components with Radix focus management. Fonts are bundled Inter and
  IBM Plex Mono; zinc neutrals, steel blue and stockout-only orange follow the plan.
- `web/app/layout.tsx` owns metadata, fonts and global styles. The page loads the
  interactive Control Tower through a client-only dynamic boundary because its
  canvas and shared URL/theme state require browser APIs. Next.js serves the route
  and recorded assets; FastAPI computes simulation results behind the rewrite.
- The Cytoscape network groups echelons and orders sites by latitude/longitude.
  Shapes distinguish suppliers, DCs, retailers and B2B buyers. Lane width scales
  with the square root of measured representative flow. Hover traces upstream;
  clicking a node opens its inspector. The native node selector provides keyboard
  access to every node without requiring canvas interaction.
- Cover uses one blue hue, capped visually at 21 days. Grey means unavailable;
  orange plus `!` means observed shortfall/backlog. Health covers all SKUs at a node.
  Query matches retain full opacity and other nodes fade to 0.15.
- KPI cards show measured-run means and 95% t intervals. The daily-fill sparkline
  is explicitly R01/SKU01's representative trajectory, rather than a network mean.
  In live mode, A/B accepts a cached baseline run ID A and displays paired B−A
  deltas for the current run B. Rate deltas are percentage points. The API rejects
  incompatible seeds or day windows. The M10 Scenario Lab supplies full paired controls.
- The time scrubber reads the complete health matrix once. Day changes use
  `cy.batch()` without replacing the network or requesting another health response.
  Playback supports 1/2/4/8 days per second and stops at the final day. Node, day,
  source and live run ID persist in the URL; theme persists in local storage.
- Supported query phrases and chips use M8's metrics and operators. Live queries
  go to the whitelisted API parser; recorded queries operate on saved node/day
  observations with the same vocabulary. Results include node, echelon and value,
  open inspectors, and export CSV. A day change clears the query so old-day matches
  are never displayed as current observations. Submit again for the new day.
- The inspector shows node cover, estimated service/cost and ECharts inventory
  balances. SKU series include warm-up; the selected day drives the chart cursor.
  CSV and PNG exports use the displayed series. ROP/Q reference lines come from
  initial nominal policy targets, not guessed values or adaptive daily targets.
  Older cache payloads without targets omit the lines. A missing denominator
  remains unavailable, rather than becoming zero.

The recorded study includes 36 nodes, 44 lanes, full node observations and each
node's SKU01 inspector. Live mode exposes all 20 SKU inspectors. Recorded output
uses `configs/m8_validation.yaml`; generated request defaults come from that YAML
as well. The new optional network metadata is documented in [contracts](../contracts/README.md).
All eleven navigation items are enabled. The six M10 study views are loaded on demand
and persist their selected view in the URL. See [study views](study-views.md) for
their controls and source limits. The source selector changes transport: saved
experiment panels remain historical evidence even when loaded through the live API.

## Checks and evidence

Install Chromium once on Windows:

```powershell
.\web\node_modules\.bin\playwright.cmd install chromium
.\.venv\Scripts\python.exe -m scm.check
```

On Linux, use `./web/node_modules/.bin/playwright install --with-deps chromium`.
The standard check runs Python checks, generated-client checks, Prettier, strict
TypeScript, Vitest, production build and Playwright. Browser tests start the built
Next.js production server and Uvicorn when these are not already running.
Ports 5173 and 8000 must be available
for the browser suite. Its API uses `data/browser-workspace/` so scenario/run tests
do not write to the normal planning portfolio. CI installs Chromium and preserves failure traces.

Separate commands:

```powershell
npm run test --prefix web
npm run build --prefix web
npm run test:e2e --prefix web
```

Run the build before invoking browser tests separately; `scm.check` does this
automatically. For a production preview, run `npm run start --prefix web` after
building. Route types are generated before strict TypeScript compilation.

Browser checks exercise recorded and actual live API flows, inspector SKU changes,
paired deltas, rejected requests, keyboard scrubbing, theme/URL persistence, chart
exports and screenshot baselines. Baselines live in `web/e2e/snapshots/`; updating
them requires visual review, then `npm run test:e2e:update --prefix web`.

The 100-node test extends the saved network with explicitly synthetic load-test
retailers and lanes. It applies 40 consecutive days, asserts no additional browser
requests and checks p95 health-update batch time below a 16.7 ms frame budget. A
separate two-animation-frame measurement has a 100 ms regression ceiling; it is
not a promise of 60 fps on every device. The unchanged physical engine is not
being benchmarked by those cloned observations.

Reproduce fixture and browser evidence:

```powershell
.\.venv\Scripts\python.exe -m scm.web_fixtures
npm run build --prefix web
npm run test:e2e --prefix web
npm run record:evidence --prefix web
```

The exporter validates responses through the API, writes the recorded payload and
request defaults, and saves its source/run/checksum manifest. Consumer tests
validate the saved network, health, KPI and time-series payloads against Pydantic
contracts. The browser recorder saves test outcomes, actual scrubber samples,
package versions and source/artifact hashes under `docs/evidence/m9/`.
Generated fixtures may have a new run ID after source changes.

M10's labs and Methodology view, and M11's deployment, static export, accessibility
audit and Lighthouse target remain separate milestones. No deployed demo or
calibrated operating recommendation is claimed here.

## E2 Planning Lab

Open `/?view=portfolio` with the API running. This module uses the server workspace
and hides the recorded/live transport selector. Scenario definitions, notes and
revision history persist in SQLite; transient editor changes remain unsaved until
explicitly saved. Use Scenario Lab's Save draft B action to continue a configured
playbook in the Planning Lab. See [planning-lab methods](planning-lab.md) for the
controls, comparisons, result diagnostics, provenance exports and calibration flow.

The browser suite now uses an isolated API workspace at `data/browser-workspace/`
and requires port 8000 to be free. It exercises named-scenario persistence,
two-replication background launches, alternatives, API comparison parity, diagnostic
tables and graceful reload failures. The evidence recorder writes current results
to `docs/evidence/planning-lab/`; earlier evidence remains historical.

## E3 learning sandbox

The twelfth module, `/?view=learning&lesson=forecast`, supports lesson deep links,
search, prediction/reflection notebooks, editable A/B assumptions, live paired
runs and uncertainty-aware results. Its three tabs are keyboard navigable and
retain the open experiment across tab switches. The Visual explorer can load
recorded evidence, the current A/B runs or a completed run ID. Source and metric
definitions distinguish daily first-replication observations from replicated KPIs.
All four chart forms use ECharts and the shared CSV/PNG exporter. Scenario B can
be saved into the persistent Planning Lab. Text notebooks remain browser-local.

Catalog generation: `python web/scripts/export-learning.py [--check]`.
Tests cover schema/physical validation and canonical catalog drift, raw-array
reconciliation and historical reads, statistical indicators, missing values and
notebook recovery. Browser checks run a real paired lesson, verify exact comparison
parity, download its evidence/CSV, explore different nodes/SKUs/chart forms, recover
notes after reload, and exercise narrow-screen/offline/error/keyboard flows.
See the [student and instructor guide](learning-sandbox.md).
