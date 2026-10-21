# Project rules

- Follow docs/plan.md, one milestone per task. Start with tests.
- This is an operations study. Use supply-chain vocabulary in code, UI and docs.
- Engine: Python 3.12, numpy vectorised over SKU and node; loop over days only. No SimPy.
- All randomness via SeedSequence streams; never call the global np.random.
- Scenario parameters live in configs/*.yaml; every value needs a source or ASSUMPTION
  note in docs/parameters.md. Report figures must come from experiment outputs.
- contracts/ is the source of truth for consumers. Explain schema changes, change the
  Pydantic models, regenerate schemas, and update fixtures and callers together.
- Frontend: React + TS strict, Tailwind + shadcn, Cytoscape for the network,
  ECharts for all charts. Colours: zinc neutrals, one accent, orange only for stockouts.
- Definition of done: make check passes (or python -m scm.check on Windows), tests
  added, docs updated, no TODOs without an issue.

