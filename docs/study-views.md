# M10 study views

Start Next.js as described in [frontend setup](frontend.md). All seven views are
available from the sidebar; `/?view=scenario` and the other view keys give direct
links. Each study view loads on demand. Recorded study uses a checked-in typed
asset and requires no Python server. Live API loads the same historical bundle
through `GET /studies`; Scenario Lab additionally computes new paired runs.

| View key | Controls and evidence |
| --- | --- |
| scenario | One/four-DC recorded pair; live A/B DC counts and six disruption sliders. Submit to recompute matched-seed runs, paired B−A deltas, network placements and eight-account cost stacks. Changed controls require resubmission. |
| network | E3 demand CV, correlation, freight and inbound lead select saved screening cells. Four-count component costs, lowest-screening-mean heatmap, placement count and latitude/longitude layout. |
| bullwhip | Four causes, POS sharing and lead factor select one of 64 E4 cells. Weekly echelon BWE means/intervals, linked orders-versus-demand representative charts and a separate daily M5 Chen check. |
| inventory | Analytical EOQ quantity slider, fixed M2 on-hand overlay, E2 representative SKU selector and achieved fill/CSL versus inventory cost with a fill-rate interval band. |
| resilience | Six M6 events, representative TTS/TTR/cost and paired rolling service. E6 mitigation selector changes the separate ±20% OAT disruption-cost tornado. |
| methodology | KaTeX formulas, searchable parameter notes, recorded V&V and downloadable validation/parameter/assumption Markdown. Final case-study report remains M12. |

All charts use ECharts with CSV/PNG export; placement uses Cytoscape. Source
labels identify the actual artifact and distinguish trajectories from replication
means. Nulls remain unavailable and ordinary t intervals are not clipped. Rates
are fractions in data; Scenario Lab displays rate differences in percentage points.
The placement-only network has no measured flow widths. The Control Tower retains
its existing per-day flow/health semantics.

## Recreate and verify evidence

From the repository root, after installing the pinned Python and npm environments:

```powershell
.\.venv\Scripts\python.exe -m scm.study_views
.\.venv\Scripts\python.exe -m scm.check
npm run record:evidence --prefix web
```

The exporter writes `web/public/fixtures/studies.json` and
`docs/evidence/m10/fixture_manifest.json`. It verifies M7 summary/Parquet hashes,
copies E2/E3/E4/E6 recorded statistics, computes an API one-versus-four-DC pair,
recreates all 64 E4 replication-zero weekly traces and reconciles their DC BWE
against original Parquet observations. Six representative M6 event trajectories
reconcile all paired metrics against the saved M6 result. It also includes M2
inventory and M5 daily theory evidence. It preserves the original source files.
Original experiment counts, seeds and sources remain visible; the exporter does
not upgrade reduced acceptance runs into full research replications.

The fixture manifest hashes exporter/API/config/schema inputs and the resulting
asset. The browser recorder writes M10 results and a separate source/output
manifest, retaining M9's historical evidence. Browser reports continue to use
the gitignored `data/m9-playwright/` directory for the shared suite. They exercise
all views, saved-cell selection/export, keyboard EOQ controls, placement/event/
mitigation selectors, methodology downloads and actual disrupted live A/B parity.
Screenshots are reviewed before accepting baseline updates. Run the production
build before browser tests when invoking them separately.

`StudyEvidence` is documented in [contracts](../contracts/README.md). Every new
control default has provenance in [parameters](parameters.md), with interpretation
limits in [assumptions](assumptions.md). Deployment, Lighthouse, broad accessibility
audits and Docker remain M11 work; this milestone is a local study application.
