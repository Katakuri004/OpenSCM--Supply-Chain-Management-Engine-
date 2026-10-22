# Contributing to OpenSCM

Contributions should improve the usefulness and transparency of supply-chain
simulation. Read `AGENTS.md` and `docs/plan.md`, choose one milestone or focused
issue, and begin with tests. Explain the operating question and the model limit.

Scenario inputs belong in `configs/*.yaml`, with every number sourced or marked
ASSUMPTION in `docs/parameters.md`. Never present illustrative inputs as company
data or invent a reported outcome. Keep randomness on SeedSequence streams.
For playbooks, edit `configs/workspace.yaml`, regenerate with
`python web/scripts/export-workspace.py`, and validate the actual engine request.

Public payload changes start in the Pydantic models and `contracts/`; regenerate
schemas, OpenAPI and TypeScript and update consumers/fixtures together. Use the
existing Next.js, strict TypeScript, Tailwind/shadcn, Cytoscape and ECharts stack.

Install the locked environments following README, then run:

```powershell
.\.venv\Scripts\python.exe -m scm.check
```

Visually inspect screenshots before updating baselines. Include the operating
behavior, relevant validation and known limits in a pull request. Avoid unrelated
refactors or new dependencies when existing components solve the problem.

Original project code is distributed under Apache-2.0. Retain license and
attribution notices, including dependency notices. Do not include proprietary
customer, supplier or inventory data in public contributions.
