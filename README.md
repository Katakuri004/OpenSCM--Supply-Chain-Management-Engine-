# Multi-echelon supply chain study

An FMCG inventory and network study on Indian lanes, with costs in INR.
The [implementation plan](docs/plan.md) defines milestones M0–M12.

M0–M4 are implemented: scaffold and contracts, analytical inventory formulas,
demand generation, single-node and multi-echelon simulation, DC selection,
four inventory policies, capacity-constrained FIFO dispatch, FTL/LTL freight,
forecasting, error metrics and ABC–XYZ replenishment policies with an E5 dry run.
M5 (bullwhip causes and countermeasures) is next.

See [analytics](docs/analytics.md) for functions, units, assumptions and examples.
See [simulation](docs/simulation.md) for daily timing, costs and reproducible M2 validation.
See [network simulation](docs/network.md) for M3 configuration, conventions and a runnable example.
See [forecasting and segmentation](docs/forecasting.md) for M4 planning and E5 evidence.

Requires Python 3.12. From this directory on Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.lock -e '.[dev]'
.\.venv\Scripts\python.exe -m scm.check
```

On Linux/macOS:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.lock -e '.[dev]'
make check
```

`make check` runs Ruff lint and format checks, strict mypy, schema drift checks and
pytest. On Windows without Make, `python -m scm.check` uses the same checks; use
the virtual environment's Python as above. `make contracts` regenerates schemas
(Windows: `.\.venv\Scripts\python.exe -m scm.contracts`). Run commands at repo root.

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
