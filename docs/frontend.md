# M9 Next.js Control Tower

Run `npm ci --prefix web`, then `npm run dev --prefix web`. Open
[localhost:5173](http://localhost:5173). The default Recorded study works without
Python running. It uses saved simulation output, not fabricated dashboard values.

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
  incompatible seeds or day windows. Full scenario comparison controls belong to M10.
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
The six other navigation items are disabled until M10 implements their views.

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
or already host this project. CI installs Chromium and preserves failure traces.

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
