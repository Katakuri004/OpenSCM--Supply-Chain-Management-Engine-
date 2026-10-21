# Multi-echelon supply chain study

An FMCG inventory and network study on Indian lanes, with costs in INR.
The [implementation plan](docs/plan.md) defines milestones M0–M12.

M0–M8 are implemented: scaffold and contracts, analytical inventory formulas,
demand generation, single-node and multi-echelon simulation, DC selection,
four inventory policies, capacity-constrained FIFO dispatch, FTL/LTL freight,
forecasting, error metrics, ABC–XYZ replenishment policies, and bullwhip causes
and countermeasures, disruption calendars, resilience metrics, and experiment grids
with paired statistics, manifests and reproducible Parquet outputs, plus a cached
FastAPI service, DuckDB filters and a generated TypeScript client.
M9 (frontend shell and Control Tower) is next.

See [analytics](docs/analytics.md) for functions, units, assumptions and examples.
See [simulation](docs/simulation.md) for daily timing, costs and reproducible M2 validation.
See [network simulation](docs/network.md) for M3 configuration, conventions and a runnable example.
See [forecasting and segmentation](docs/forecasting.md) for M4 planning and E5 evidence.
See [bullwhip](docs/bullwhip.md) for M5 switches, V7 and controlled network comparisons.
See [resilience](docs/resilience.md) for M6 event semantics, survival and recovery measurements.
See [experiments](docs/experiments.md) for M7 E1–E6 grids, CLI commands and output contracts.
See [API and query layer](docs/api.md) for M8 endpoints, caching, KPI conventions and client usage.

Requires Python 3.12. From this directory on Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.lock -e '.[dev]'
npm ci --prefix web
.\.venv\Scripts\python.exe -m scm.check
```

On Linux/macOS:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.lock -e '.[dev]'
npm ci --prefix web
make check
```

`make check` runs Ruff lint and format checks, strict mypy, schema drift checks and
pytest, OpenAPI/client drift checks and strict TypeScript compilation. Node.js 22+
and the pinned npm packages are required. On Windows without Make,
`python -m scm.check` uses the same checks; use
the virtual environment's Python as above. `make contracts` regenerates schemas,
OpenAPI and client types. See [regeneration commands](docs/api.md) for Windows.
Run commands at repo root.

See [contracts](contracts/README.md), [parameters](docs/parameters.md),
[assumptions](docs/assumptions.md) and [validation status](docs/validation.md).
Dependencies are introduced as each milestone needs them. API and frontend stack
choices remain as specified in the plan.
`requirements-dev.lock` records the tested dependency versions used locally and in CI.

Recreate the M2 validation evidence and plots (about half a minute locally):

```powershell
.\.venv\Scripts\python.exe -m scm.sim.validate --output docs/evidence/m2
```

Recreate the M3 risk-pooling and 455-day network performance evidence:

```powershell
.\.venv\Scripts\python.exe -m scm.sim.validate_network --output docs/evidence/m3
```

Recreate the M4 uniform-versus-segmented replenishment dry run:

```powershell
.\.venv\Scripts\python.exe -m scm.experiments.e5_dry_run --output docs/evidence/m4
```

Recreate the M5 Chen benchmark and paired cause/countermeasure evidence:

```powershell
.\.venv\Scripts\python.exe -m scm.experiments.e4_validate --output docs/evidence/m5
```

Recreate the M6 survival check and repeated paired disruption runs:

```powershell
.\.venv\Scripts\python.exe -m scm.experiments.e6_validate --output docs/evidence/m6
```

Run an experiment with the full study settings, or reproduce its smaller acceptance run:

```powershell
.\.venv\Scripts\python.exe -m scm.experiments.runner E3 --output data/experiments
.\.venv\Scripts\python.exe -m scm.experiments.runner E3 --config configs/m7_validation.yaml --output docs/evidence/m7
```

Replace `E3` with any of `E1` through `E6`. Full study grids can require thousands
of replications; saved M7 acceptance evidence uses reduced replication counts.

Start the local API and recreate M8 acceptance evidence:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
.\.venv\Scripts\python.exe -m scm.api_validate --output docs/evidence/m8
```

The interactive API documentation is at [localhost:8000/docs](http://localhost:8000/docs).
