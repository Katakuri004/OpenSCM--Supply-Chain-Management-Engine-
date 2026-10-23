# README website screenshots

These are real, unretouched screenshots of OpenSCM, captured by
`web/scripts/capture-walkthrough.mjs` with the installed Playwright Chromium.
The root README embeds all 20 images. Desktop screenshots use a 1440×1080
viewport at device scale 1; panel captures use their natural dimensions. The dark
motion-preferences capture uses a 390×844 browser viewport.

## Capture sources

- Operations overview, exceptions and Control Tower show the committed reference
  fixture at day 120. The facility inspector shows R01. Scenario, network, inventory,
  bullwhip, resilience and methodology use the committed study bundle and its
  analytical/reference controls.
- The builder shows the reference model from the real model catalog, validated
  and saved as a revision in the documentation API. It is configured input data,
  not a claimed simulation result or optimised network.
- Learning results and Planning Lab comparisons come from actual runs of the
  unchanged `forecast` lesson in `configs/learning.yaml`: seed 222, two paired
  replications, 90-day warm-up and 365-day measured horizon. Condition A uses a
  7-day moving average and B a 28-day window. These are the lesson's documented
  synthetic assumptions. No new scenario parameters are introduced by the capture.
- Planning definitions reuse the same canonical A/B requests; launching them can
  reuse the existing physics cache. The UI comparison delta is checked against
  the actual API value before capture. Diagnostics belong to representative B.
- Student prediction text is illustrative prose, not a measured outcome. It is
  entered through the interface before the actual run. Browser state is isolated
  from the user's normal browser profile.

The [manifest](manifest.json) records the UI commit, capture command/time, source
hashes, module/route, source kind, PNG dimensions and checksums. The
[learning evidence](learning-evidence.json), [planning evidence](planning-evidence.json)
and [builder snapshot](builder-evidence.json) retain the corresponding run
comparison/provenance, diagnostics and saved model. There are no generated or
retouched chart values. Screenshots are examples of the synthetic software, not
empirical business findings.

## Recreate

Install the repository dependencies and Playwright Chromium as described in the
root README. From the repository root, start the frontend in one terminal:

```sh
npm run dev --prefix web
```

Start a **separate documentation API** in a second terminal. Use the dedicated
run root so screenshot capture cannot populate the normal planning workspace.

```powershell
# Windows PowerShell
$env:SCM_RUN_ROOT = "data/readme-workspace/runs"
.\.venv\Scripts\python.exe -m uvicorn api.app.main:app --host 127.0.0.1 --port 8001
```

```sh
# Linux/macOS
SCM_RUN_ROOT=data/readme-workspace/runs .venv/bin/python -m uvicorn api.app.main:app --host 127.0.0.1 --port 8001
```

In a third terminal:

```sh
npm run capture:walkthrough --prefix web
```

The capture script forwards browser API requests to the real service on port 8001;
it does not fabricate responses or use the frontend's normal port-8000 portfolio.
`SCM_WALKTHROUGH_URL` and `SCM_WALKTHROUGH_API` override the frontend/documentation
API URLs if necessary. Port 8000 is rejected for the documentation API.

Capture replaces the PNGs and evidence in this folder and creates isolated
documentation scenarios/runs under `data/readme-workspace/`. Repeated capture may
add named examples there; it does not delete prior data. Stop the documentation
API after capture. The generated manifest is written only after every journey
completes without browser errors.

Review the images at full size for clipping, chart readability, private data and
source labels. Keep the relative paths/alt descriptions in the root README in
sync, then run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_readme_walkthrough.py -q
.\.venv\Scripts\python.exe -m scm.check
```

The README tests verify all 13 modules, every embedded image, PNG dimensions,
checksums, run-evidence hashes, local file links and in-document navigation.
Future UI changes do not rewrite old milestone evidence automatically; recapture
this folder deliberately when updating the public walkthrough.
