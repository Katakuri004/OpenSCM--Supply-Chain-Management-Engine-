import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, Download, Play, Plus, Save } from "lucide-react";
import { Button } from "../components/ui/button";
import { client, read } from "../lib/data";
import { useTower } from "../lib/state";
import { download, number, type Schema } from "../lib/tower";
import {
  assessGoal,
  caseDefinition,
  draftKey,
  readCaseDraft,
  starterCase,
  type CaseDraft,
  type SavedCase,
} from "../lib/cases";
import { requestDifferences } from "../lib/learning";
import lessons from "../fixtures/learning.json";
import limits from "../fixtures/cases.json";
import LabControls from "./lab-controls";
import LearningResults from "./learning-results";
import RunExplanation from "./run-explanation";

export default function DecisionCases() {
  const { decisionCase, set } = useTower();
  const cache = useQueryClient();
  const [template, setTemplate] = useState(limits.initial_lesson);
  const [importError, setImportError] = useState("");
  const [packageText, setPackageText] = useState("");
  const library = useQuery({
    queryKey: ["cases"],
    queryFn: async () => read(await client.GET("/cases")),
  });
  const detail = useQuery({
    queryKey: ["case", decisionCase],
    enabled: !!decisionCase,
    queryFn: async () =>
      read(await client.GET("/cases/{identity}", { params: { path: { identity: decisionCase } } })),
  });
  const create = useMutation({
    mutationFn: async (body: CaseDraft) => read(await client.POST("/cases", { body })),
    onSuccess: (value) => {
      void cache.invalidateQueries({ queryKey: ["cases"] });
      set({ decisionCase: value.id, caseExecution: "" });
    },
  });
  const importing = useMutation({
    mutationFn: async () => {
      if (new TextEncoder().encode(packageText).length > limits.max_package_bytes)
        throw new Error("Package exceeds 2 MB.");
      return read(
        await client.POST("/cases/import", {
          body: JSON.parse(packageText) as Schema["CasePackage"],
        }),
      );
    },
    onSuccess: (value) => {
      setPackageText("");
      setImportError("");
      void cache.invalidateQueries({ queryKey: ["cases"] });
      set({ decisionCase: value.id, caseExecution: "" });
    },
  });
  const error = library.error ?? detail.error ?? create.error ?? importing.error;
  return (
    <div className="space-y-5">
      <section className="workspace-callout">
        <div className="max-w-3xl">
          <p className="eyebrow">SUPPLY-CHAIN DECISION STRESS LAB / CASE WORKSPACE</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Make a decision you can explain.
          </h2>
          <p className="lab-help">
            Frame an operating question, commit a prediction, compare two plans and keep the
            evidence with your decision. Keep your model, alternatives and evidence in one
            investigation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {["01 · Frame", "02 · Model", "03 · Compare", "04 · Defend"].map((label) => (
              <span key={label} className="rounded border border-[var(--border)] px-3 py-2">
                {label}
              </span>
            ))}
          </div>
        </div>
        <Button variant="outline" onClick={() => set({ decisionCase: "", caseExecution: "" })}>
          <Plus />
          Case library
        </Button>
      </section>
      {error && (
        <section
          role="alert"
          aria-label="Case service error"
          className="panel space-y-3 p-4 text-sm"
        >
          <p>{error.message} Case saving and execution require the local API.</p>
          <Button
            variant="outline"
            onClick={() => {
              void library.refetch();
              void detail.refetch();
            }}
          >
            Retry connection
          </Button>
          <Button
            variant="ghost"
            onClick={() => set({ view: "learning", decisionCase: "", caseExecution: "" })}
          >
            Explore learning examples
          </Button>
        </section>
      )}
      {!decisionCase ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
            <div className="panel space-y-4 p-5">
              <p className="eyebrow">START WITH AN OPERATING QUESTION</p>
              <label className="lab-field">
                <span>Investigation template</span>
                <select
                  aria-label="Investigation template"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                >
                  {lessons.lessons.map((lesson) => (
                    <option value={lesson.id} key={lesson.id}>
                      {lesson.title}
                    </option>
                  ))}
                </select>
              </label>
              <h3 className="text-lg font-semibold">
                {lessons.lessons.find((r) => r.id === template)?.question}
              </h3>
              <p className="lab-help">
                {lessons.lessons.find((r) => r.id === template)?.mechanism}
              </p>
              <p className="lab-help">
                {lessons.lessons.find((r) => r.id === template)?.assumption}
              </p>
              <Button
                disabled={create.isPending}
                loading={create.isPending}
                onClick={() => create.mutate(starterCase(template))}
              >
                <Plus />
                Start decision case
              </Button>
            </div>
            <div className="panel space-y-3 p-5">
              <p className="eyebrow">YOUR INVESTIGATIONS</p>
              {library.isPending && <p role="status">Loading saved cases…</p>}
              {library.data?.length === 0 && (
                <p className="lab-help">
                  Your first case will keep the complete A/B investigation here. Existing scenarios
                  remain in Planning Lab.
                </p>
              )}
              <div className="max-h-80 space-y-2 overflow-auto">
                {library.data?.map((row) => (
                  <button
                    className="nav-item w-full border border-[var(--border)]"
                    key={row.id}
                    onClick={() => set({ decisionCase: row.id, caseExecution: "" })}
                  >
                    <span className="flex-1 text-left">
                      {row.name}
                      <small className="block text-[var(--secondary)]">
                        Revision {row.revision} ·{" "}
                        {row.decision ? "Decision recorded" : "Investigation open"}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          </section>
          <details className="panel p-5">
            <summary>Import a portable decision case</summary>
            <p className="lab-help">
              Versioned JSON, up to 2 MB. Imported evidence is an externally supplied archive, not a
              locally verified run. Import creates a new case.
            </p>
            <input
              aria-label="Case package file"
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > limits.max_package_bytes) {
                  setImportError("Package exceeds 2 MB.");
                  return;
                }
                void file
                  .text()
                  .then(setPackageText)
                  .catch(() => setImportError("Cannot read this file."));
              }}
            />
            <textarea
              aria-label="Case package JSON"
              className="mt-3 min-h-28 w-full mono text-xs"
              value={packageText}
              onChange={(e) => setPackageText(e.target.value)}
            />
            <Button
              disabled={!packageText || importing.isPending}
              loading={importing.isPending}
              onClick={() => importing.mutate()}
            >
              Import as new case
            </Button>
            {importError && <p role="alert">{importError}</p>}
          </details>
        </>
      ) : detail.data ? (
        <CaseEditor
          key={detail.data.case.id}
          initial={detail.data.case}
          imported={detail.data.imported_evidence ?? null}
        />
      ) : (
        !detail.error && <p role="status">Loading case…</p>
      )}
    </div>
  );
}

const steps = ["Brief", "Alternatives", "Evidence", "Decision"] as const;
function CaseEditor({
  initial,
  imported,
}: {
  initial: SavedCase;
  imported: Schema["CaseEvidence"] | null;
}) {
  const { caseExecution, caseSide, set } = useTower();
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState<CaseDraft>(() => caseDefinition(initial));
  const [step, setStep] = useState<(typeof steps)[number]>("Brief");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [recovery, setRecovery] = useState(() => {
    try {
      return readCaseDraft(localStorage.getItem(draftKey(initial.id)));
    } catch {
      return null;
    }
  });
  const [storageError, setStorageError] = useState("");
  const [json, setJson] = useState("");
  const [archive, setArchive] = useState(false);
  const cache = useQueryClient();
  const path = { identity: base.id };
  const dirty = JSON.stringify(draft) !== JSON.stringify(caseDefinition(base));
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(
        draftKey(base.id),
        JSON.stringify({ revision: base.revision, definition: draft }),
      );
    } catch {
      setStorageError(
        "Browser recovery storage is unavailable. Save or export your draft before navigating.",
      );
    }
  }, [base.id, base.revision, draft, dirty]);
  const catalog = useQuery({
    queryKey: ["lab-catalog"],
    queryFn: async () => read(await client.GET("/lab")),
  });
  const scenarios = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => read(await client.GET("/portfolio")),
  });
  const history = useQuery({
    queryKey: ["case-history", base.id],
    queryFn: async () => read(await client.GET("/cases/{identity}/runs", { params: { path } })),
    refetchInterval: (q) =>
      q.state.data?.some((r) =>
        [r.status_a, r.status_b].some((s) => s && ["queued", "running"].includes(s.status)),
      )
        ? 500
        : false,
  });
  const revisions = useQuery({
    queryKey: ["case-revisions", base.id],
    queryFn: async () =>
      read(await client.GET("/cases/{identity}/revisions", { params: { path } })),
  });
  const selected = history.data?.find((r) => r.id === caseExecution) ?? history.data?.[0];
  const evidence = useQuery({
    queryKey: ["case-evidence", base.id, selected?.id],
    enabled: !!selected?.evidence_available && !archive,
    queryFn: async () =>
      read(
        await client.GET("/cases/{identity}/runs/{execution}/evidence", {
          params: { path: { ...path, execution: selected!.id } },
        }),
      ),
  });
  const result = archive ? imported : evidence.data;
  function accept(value: SavedCase) {
    setStorageError("");
    setJson("");
    setBase(value);
    setDraft(caseDefinition(value));
    setRecovery(null);
    try {
      localStorage.removeItem(draftKey(value.id));
    } catch {
      /* The server save remains durable. */
    }
    cache.setQueryData(["case", value.id], { case: value, imported_evidence: imported });
    void cache.invalidateQueries({ queryKey: ["cases"] });
    void cache.invalidateQueries({ queryKey: ["case-revisions", value.id] });
  }
  const save = useMutation({
    mutationFn: async () =>
      read(
        await client.PUT("/cases/{identity}", {
          params: { path },
          body: { ...draft, revision: base.revision },
        }),
      ),
    onSuccess: accept,
  });
  const reload = useMutation({
    mutationFn: async () => read(await client.GET("/cases/{identity}", { params: { path } })),
    onSuccess: (value) => accept(value.case),
  });
  const clone = useMutation({
    mutationFn: async () =>
      read(
        await client.POST("/cases", {
          body: { ...draft, name: `${draft.name.slice(0, 90)} · copy` },
        }),
      ),
    onSuccess: (value) => {
      void cache.invalidateQueries({ queryKey: ["cases"] });
      set({ decisionCase: value.id, caseExecution: "" });
    },
  });
  const launch = useMutation({
    mutationFn: async () =>
      read(
        await client.POST("/cases/{identity}/runs", {
          params: { path },
          body: { revision: base.revision },
        }),
      ),
    onSuccess: (value) => {
      set({ caseExecution: value.id });
      setArchive(false);
      setStep("Evidence");
      void history.refetch();
    },
  });
  const validate = useMutation({
    mutationFn: async (body: CaseDraft) => read(await client.POST("/cases/validate", { body })),
    onSuccess: (value) => {
      setDraft(value);
      setJson("");
      setStorageError("");
    },
  });
  const recover = useMutation({
    mutationFn: async () =>
      read(await client.POST("/cases/validate", { body: recovery!.definition })),
    onSuccess: (value) => {
      setDraft(value);
      setBase({ ...base, revision: recovery!.revision });
      setRecovery(null);
    },
  });
  const loadScenario = useMutation({
    mutationFn: async (id: string) => {
      const scenario = scenarios.data?.find((r) => r.id === id);
      if (!scenario) throw new Error("Select a saved scenario.");
      const request = scenario.request;
      const other = caseSide === "a" ? draft.alternative : draft.baseline;
      const aligned = {
        ...other,
        seed: request.seed ?? 0,
        replications: request.replications ?? 1,
        overrides: {
          ...other.overrides,
          warmup_days: request.overrides?.warmup_days ?? null,
          horizon_days: request.overrides?.horizon_days ?? null,
        },
      };
      return read(
        await client.POST("/cases/validate", {
          body: {
            ...draft,
            baseline: caseSide === "a" ? request : aligned,
            alternative: caseSide === "b" ? request : aligned,
          },
        }),
      );
    },
    onSuccess: (value) => setDraft(value),
  });
  const exported = useMutation({
    mutationFn: async () =>
      read(
        await client.GET("/cases/{identity}/package", {
          params: {
            path,
            query: archive
              ? { archive: true }
              : selected?.evidence_available
                ? { execution_id: selected.id }
                : {},
          },
        }),
      ),
    onSuccess: (value) => download(`${base.name}-case.json`, JSON.stringify(value, null, 2)),
  });
  const error =
    save.error ??
    reload.error ??
    clone.error ??
    launch.error ??
    validate.error ??
    recover.error ??
    loadScenario.error ??
    exported.error ??
    history.error ??
    evidence.error ??
    catalog.error ??
    revisions.error ??
    scenarios.error;
  const busy =
    launch.isPending ||
    history.data?.some((r) =>
      [r.status_a, r.status_b].some((s) => s && ["queued", "running"].includes(s.status)),
    );
  const ready =
    !!draft.prediction?.trim() && Object.values(draft.goals ?? {}).some((v) => v != null);
  const activeRequest = caseSide === "a" ? draft.baseline : draft.alternative;
  function updateRequest(request: Schema["RunRequest"]) {
    const other = caseSide === "a" ? draft.alternative : draft.baseline;
    const aligned = {
      ...other,
      seed: request.seed ?? 0,
      replications: request.replications ?? 1,
      overrides: {
        ...other.overrides,
        warmup_days: request.overrides?.warmup_days ?? null,
        horizon_days: request.overrides?.horizon_days ?? null,
      },
    };
    setDraft({
      ...draft,
      baseline: caseSide === "a" ? request : aligned,
      alternative: caseSide === "b" ? request : aligned,
    });
  }
  function brief() {
    const snapshot = result?.execution.snapshot;
    const content = [
      `# ${draft.name}`,
      draft.question,
      "## Assumptions",
      draft.assumptions ?? "",
      "## Prediction",
      draft.prediction ?? "",
      "## Acceptance goals",
      JSON.stringify(draft.goals),
      "## Observations",
      draft.observations ?? "",
      "## Reflection",
      draft.reflection ?? "",
      "## Decision",
      draft.decision ?? "",
      "## Evidence",
      result
        ? `Evidence snapshot: revision ${snapshot!.revision}; ${result.comparison.replications} paired replications. ${archive ? "Externally supplied archive, not locally verified." : "Local execution."}`
        : "No execution evidence selected.",
      ...(result
        ? [
            "Current notebook and historical evidence can differ. Goals below belong to the execution snapshot.",
            JSON.stringify(snapshot!.goals),
            ...Object.keys(result.comparison.metrics).map(
              (metric) =>
                `${metric}: A=${result.a.metrics[metric]?.mean ?? "unavailable"}; B=${result.b.metrics[metric]?.mean ?? "unavailable"}; paired B-A=${JSON.stringify(result.comparison.metrics[metric])}`,
            ),
            ...result.provenance.map(
              (p) =>
                `Run ${p.run_id}; source ${p.input_sha256}; seeds ${p.replication_seeds.join(", ")}`,
            ),
          ]
        : []),
      "Synthetic simulation evidence is conditional on documented assumptions. Simulation intervals exclude model error; no independent stress validation has been performed.",
    ];
    download(`${draft.name}-decision.md`, content.join("\n\n"));
  }
  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-semibold">{base.name}</h2>
          <p className="lab-help">
            Saved r{base.revision} · {dirty ? "Unsaved changes" : "All changes saved"} ·{" "}
            {base.decision ? "Decision recorded" : "Investigation open"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={clone.isPending} onClick={() => clone.mutate()}>
            <Copy />
            Fork definition
          </Button>
          <Button variant="outline" disabled={exported.isPending} onClick={() => exported.mutate()}>
            <Download />
            Export saved case
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              download(
                `${draft.name}-draft.json`,
                JSON.stringify({ format: "openscm-case-v1", definition: draft }, null, 2),
              )
            }
          >
            Export draft
          </Button>
          <Button
            disabled={!dirty || save.isPending}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            Save case
          </Button>
        </div>
      </section>
      {recovery && (
        <section className="panel space-y-2 p-4 text-sm">
          <p>
            Unsaved browser draft found from revision {recovery.revision}.
            {recovery.revision !== base.revision &&
              " The server has changed. Recovering retains its old revision so a save cannot overwrite newer work."}
          </p>
          <Button variant="outline" disabled={recover.isPending} onClick={() => recover.mutate()}>
            Recover draft
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRecovery(null);
              try {
                localStorage.removeItem(draftKey(base.id));
              } catch {
                /* Recovery dismissal is optional. */
              }
            }}
          >
            Dismiss recovery
          </Button>
        </section>
      )}
      {(error || storageError) && (
        <section
          role="alert"
          aria-label="Case workspace error"
          className="panel space-y-2 p-4 text-sm"
        >
          <p>{error?.message ?? storageError}</p>
          <Button variant="outline" disabled={reload.isPending} onClick={() => reload.mutate()}>
            Discard draft and reload saved case
          </Button>
        </section>
      )}
      <div role="tablist" aria-label="Case journey" className="panel grid grid-cols-4 gap-1 p-1">
        {steps.map((label, index) => (
          <button
            key={label}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            role="tab"
            id={`case-tab-${index}`}
            aria-controls="case-step"
            aria-selected={step === label}
            tabIndex={step === label ? 0 : -1}
            className={`rounded px-2 py-3 text-xs ${step === label ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--muted)]"}`}
            onClick={() => setStep(label)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowRight"
                  ? (index + 1) % 4
                  : e.key === "ArrowLeft"
                    ? (index + 3) % 4
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 3
                        : null;
              if (next !== null) {
                e.preventDefault();
                setStep(steps[next]!);
                tabs.current[next]?.focus();
              }
            }}
          >
            {String(index + 1).padStart(2, "0")} · {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="case-step"
        aria-labelledby={`case-tab-${steps.indexOf(step)}`}
        className="space-y-5"
      >
        {step === "Brief" && (
          <>
            <section className="panel space-y-4 p-5">
              <p className="eyebrow">FRAME THE OPERATING DECISION</p>
              {(
                [
                  ["name", "Case name", 100],
                  ["question", "Operating question", 2000],
                  ["assumptions", "Synthetic assumptions and scope", 10000],
                  ["prediction", "Prediction before running", 4000],
                ] as const
              ).map(([key, label, max]) => (
                <label key={key} className="lab-field">
                  <span>{label}</span>
                  <textarea
                    aria-label={label}
                    maxLength={max}
                    rows={key === "name" ? 1 : 3}
                    value={draft[key] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </label>
              ))}
              <p className="lab-help">
                Your prediction and goals are retained in each launch snapshot. Attachment of
                existing runs records the snapshot at attachment time; it does not prove that the
                prediction preceded those runs.
              </p>
            </section>
            <section className="panel space-y-4 p-5">
              <h3 className="font-semibold">Acceptance goals</h3>
              <p className="lab-help">
                Choose at least one goal. Blank means no criterion. These are illustrative
                acceptance criteria until calibrated; a simulation interval is not a real-world
                guarantee.
              </p>
              <div className="lab-grid">
                {(
                  [
                    ["service_floor", "Minimum immediate fill (0–1)", 1],
                    ["cost_ceiling_inr", "Maximum operating landed cost (INR)", undefined],
                    ["inventory_ceiling_days", "Maximum days of inventory", undefined],
                  ] as const
                ).map(([key, label, max]) => (
                  <label key={key} className="lab-field">
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      type="number"
                      min={0}
                      max={max}
                      step="any"
                      value={draft.goals?.[key] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          goals: {
                            ...draft.goals,
                            [key]: e.target.value === "" ? null : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <Button variant="outline" onClick={() => setStep("Alternatives")}>
                Configure the conditions <ArrowRight />
              </Button>
            </section>
          </>
        )}
        {step === "Alternatives" && (
          <>
            <section className="panel space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Two conditions. One controlled experiment.</h3>
                <label className="field">
                  Edit condition
                  <select
                    aria-label="Edit case condition"
                    value={caseSide}
                    onChange={(e) => {
                      set({ caseSide: e.target.value as "a" | "b" });
                      setJson("");
                    }}
                  >
                    <option value="a">A · Baseline</option>
                    <option value="b">B · Alternative</option>
                  </select>
                </label>
              </div>
              <p className="lab-help">
                Seed, replication count and observation window stay aligned across A and B. All
                other changes are explicit below. Keep facility and SKU masters identical for paired
                comparison.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft({ ...draft, alternative: structuredClone(draft.baseline) });
                    setJson("");
                  }}
                >
                  Copy A into B
                </Button>
                <Button variant="outline" onClick={() => set({ view: "builder" })}>
                  Open network builder
                </Button>
                <Button variant="outline" onClick={() => set({ view: "portfolio" })}>
                  Open Planning Lab
                </Button>
              </div>
              <label className="lab-field">
                <span>Load saved scenario into {caseSide.toUpperCase()}</span>
                <select
                  aria-label="Load saved scenario into case"
                  value=""
                  onChange={(e) => loadScenario.mutate(e.target.value)}
                >
                  <option value="">Select a configuration…</option>
                  {scenarios.data?.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name} · r{row.revision}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            {catalog.data && (
              <section className="panel p-5">
                <LabControls
                  key={`${caseSide}-${activeRequest.model ? "custom" : "reference"}`}
                  request={activeRequest}
                  change={updateRequest}
                  catalog={catalog.data}
                />
              </section>
            )}
            <details className="panel space-y-3 p-5">
              <summary>Full condition JSON · model and advanced assumptions</summary>
              <p className="lab-help">
                Validate before applying. An invalid pair leaves the current draft unchanged.
              </p>
              <textarea
                aria-label="Condition JSON"
                className="min-h-52 w-full mono text-xs"
                value={json || JSON.stringify(activeRequest, null, 2)}
                onChange={(e) => setJson(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={validate.isPending}
                onClick={() => {
                  try {
                    const request = JSON.parse(
                      json || JSON.stringify(activeRequest),
                    ) as Schema["RunRequest"];
                    validate.mutate({
                      ...draft,
                      [caseSide === "a" ? "baseline" : "alternative"]: request,
                    });
                  } catch {
                    setStorageError(
                      "Invalid condition JSON. Correct the document before applying.",
                    );
                  }
                }}
              >
                Validate and apply condition
              </Button>
            </details>
            <section className="panel overflow-hidden">
              <div className="p-4">
                <h3 className="font-semibold">Changed inputs · B versus A</h3>
                <p className="lab-help">
                  Stored requests, including explicit custom model changes. Inherited reference
                  values remain documented in Methodology and run provenance.
                </p>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="operations-table" aria-label="Case changed inputs">
                  <thead>
                    <tr>
                      <th>Input</th>
                      <th>A</th>
                      <th>B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestDifferences(draft.baseline, draft.alternative).map((row) => (
                      <tr key={row.input}>
                        <td className="mono">{row.input}</td>
                        <td className="max-w-72 break-all mono">{row.a}</td>
                        <td className="max-w-72 break-all mono">{row.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="lab-help">
                {dirty
                  ? "Save the case before launching."
                  : !ready
                    ? "Record a prediction and at least one goal in Brief."
                    : "Launch retains an immutable snapshot of this revision and both requests."}
              </p>
              <Button
                disabled={dirty || !ready || !!busy}
                loading={!!busy}
                onClick={() => launch.mutate()}
              >
                <Play />
                Run saved comparison
              </Button>
            </section>
          </>
        )}
        {step === "Evidence" && (
          <>
            <section className="panel space-y-3 p-5">
              <h3 className="font-semibold">Execution evidence</h3>
              <p className="lab-help">
                Latest {limits.history_limit} launches are listed. Every execution keeps its own
                requests, prediction and goals. Editing the current case never rewrites older
                evidence.
              </p>
              <select
                aria-label="Case execution"
                value={archive ? "imported" : (selected?.id ?? "")}
                onChange={(e) => {
                  setArchive(e.target.value === "imported");
                  if (e.target.value !== "imported") set({ caseExecution: e.target.value });
                }}
              >
                <option value="" disabled>
                  Select execution…
                </option>
                {history.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.launched_at).toLocaleString()} · r{r.snapshot.revision} ·{" "}
                    {r.origin === "attached" ? "Attached" : "Launched"} ·{" "}
                    {r.status_a?.status ?? "cache unavailable"} /{" "}
                    {r.status_b?.status ?? "cache unavailable"}
                  </option>
                ))}
                {imported && (
                  <option value="imported">Imported evidence · externally supplied archive</option>
                )}
              </select>
              {!selected && !imported && (
                <p className="lab-help">
                  No comparison yet. Configure and save your conditions, prediction and goals, then
                  run from Alternatives.
                </p>
              )}
              {!archive && selected && (
                <p className="lab-help">
                  A: {selected.status_a?.status ?? "Raw cache unavailable"} · B:{" "}
                  {selected.status_b?.status ?? "Raw cache unavailable"}
                  {selected.status_a?.error || selected.status_b?.error
                    ? ` · ${selected.status_a?.error ?? selected.status_b?.error}`
                    : ""}
                  .{" "}
                  {selected.evidence_available
                    ? "Comparison evidence is durably archived."
                    : "Evidence will appear after both conditions complete."}
                </p>
              )}
              {result && (
                <p className="lab-help">
                  Showing evidence snapshot r{result.execution.snapshot.revision}; current editor r
                  {base.revision}
                  {dirty ? " with unsaved changes" : ""}.{" "}
                  {archive
                    ? "Imported evidence is not locally verified. Its run IDs are not attached to local runs."
                    : "Local evidence from the saved execution."}{" "}
                  This is a paired comparison, not independent stress validation.
                </p>
              )}
            </section>
            {result && (
              <>
                <section className="panel p-5">
                  <h3 className="mb-3 font-semibold">Acceptance against the execution's goals</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    {(
                      [
                        ["service_floor", "fill_rate", "Minimum immediate fill", "min"],
                        [
                          "cost_ceiling_inr",
                          "total_landed_cost_inr",
                          "Maximum operating landed cost (INR)",
                          "max",
                        ],
                        [
                          "inventory_ceiling_days",
                          "days_of_inventory",
                          "Maximum inventory (days)",
                          "max",
                        ],
                      ] as const
                    ).map(([key, metric, label, direction]) => {
                      const goal = result.execution.snapshot.goals?.[key];
                      return (
                        <div key={key} className="rounded border border-[var(--border)] p-3">
                          <p className="text-xs">{label}</p>
                          <strong className="mt-2 block text-lg">
                            {goal == null
                              ? "No criterion"
                              : number(goal, key === "service_floor" ? 3 : 2)}
                          </strong>
                          {goal != null && (
                            <>
                              <p className="mt-2 text-xs">
                                A · {assessGoal(result.a.metrics[metric], goal, direction)}
                              </p>
                              <p className="mt-1 text-xs font-semibold">
                                B · {assessGoal(result.b.metrics[metric], goal, direction)}
                              </p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="lab-help">
                    Meets: the entire 95% interval satisfies this goal. Misses: the entire interval
                    breaches it. Overlap is uncertain; one replication cannot establish uncertainty.
                    These are per-metric indicators, not a joint confidence or certification.
                  </p>
                </section>
                <LearningResults
                  result={result}
                  goal={result.execution.snapshot.goals?.service_floor ?? undefined}
                />
                <details className="panel p-4">
                  <summary>Execution snapshot and provenance</summary>
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(
                      { snapshot: result.execution.snapshot, provenance: result.provenance },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                {!archive && selected && (
                  <div className="flex flex-wrap gap-2">
                    {(["a", "b"] as const).map((side) => (
                      <Button
                        key={side}
                        variant="outline"
                        disabled={selected[`status_${side}`]?.status !== "complete"}
                        onClick={() => {
                          set({
                            view: "tower",
                            mode: "live",
                            run: selected[`run_${side}`],
                            caseExecution: selected.id,
                            caseSide: side,
                            day: result.provenance[side === "a" ? 0 : 1]!.scenario.warmup_days ?? 0,
                          });
                        }}
                      >
                        Inspect condition {side.toUpperCase()} in Control Tower
                      </Button>
                    ))}
                  </div>
                )}
                {!archive && selected?.status_b?.status === "complete" ? (
                  <RunExplanation runId={selected.run_b} />
                ) : (
                  result.diagnostics && (
                    <details className="panel p-4">
                      <summary>
                        Archived condition B diagnostics · representative replication
                      </summary>
                      <p className="lab-help">
                        Observed SKU, facility and lane contributors from the first replication; not
                        causal attribution or replicated averages.
                      </p>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                        {JSON.stringify(result.diagnostics, null, 2)}
                      </pre>
                    </details>
                  )
                )}
              </>
            )}
          </>
        )}
        {step === "Decision" && (
          <>
            <section className="panel space-y-4 p-5">
              <p className="eyebrow">DEFEND THE OPERATING CHOICE</p>
              <h3 className="font-semibold">
                What would you recommend—and what remains uncertain?
              </h3>
              {(
                [
                  ["observations", "Observations and trade-offs", 10000],
                  ["reflection", "Reflection and limitations", 4000],
                  ["decision", "Decision and next validation", 10000],
                ] as const
              ).map(([key, label, max]) => (
                <label key={key} className="lab-field">
                  <span>{label}</span>
                  <textarea
                    aria-label={label}
                    rows={4}
                    maxLength={max}
                    value={draft[key] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </label>
              ))}
              <p className="lab-help">
                Separate observed contributors from causal claims. State calibration gaps, untested
                disruptions and the independent validation needed before applying the plan in an
                operating network.
              </p>
              <Button variant="outline" onClick={brief}>
                <Download />
                Export decision brief
              </Button>
            </section>
            <section className="panel space-y-3 p-5">
              <h3 className="font-semibold">Revision history</h3>
              <p className="lab-help">
                Restore a previous definition into the draft, then save as a new revision. Existing
                evidence remains attached to its original snapshot.
              </p>
              <select
                aria-label="Restore case revision"
                value=""
                onChange={(e) => {
                  const old = revisions.data?.find((r) => r.revision === Number(e.target.value));
                  if (old) {
                    setDraft(caseDefinition(old));
                    setJson("");
                  }
                }}
              >
                <option value="">Choose revision to restore…</option>
                {revisions.data?.map((r) => (
                  <option key={r.revision} value={r.revision}>
                    r{r.revision} · {new Date(r.updated_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
