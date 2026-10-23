import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Download, FlaskConical } from "lucide-react";
import catalog from "../fixtures/learning.json";
import { Button } from "../components/ui/button";
import { client, read } from "../lib/data";
import { readNotebook, requestDifferences, type LearningResult } from "../lib/learning";
import { useTower, type ViewKey } from "../lib/state";
import { download, type Schema } from "../lib/tower";
import LabControls, { Numeric } from "./lab-controls";
import LearningExplorer from "./learning-explorer";
import LearningResults from "./learning-results";
import RunExplanation from "./run-explanation";

type Request = Schema["RunRequest"];
type Lesson = (typeof catalog.lessons)[number];
export default function LearningWorkspace() {
  const { lesson, set } = useTower();
  const [tab, setTab] = useState("experiments");
  const [search, setSearch] = useState("");
  const [runs, setRuns] = useState<{ a: string; b: string }>();
  const selected = catalog.lessons.find((row) => row.id === lesson) ?? catalog.lessons[0]!;
  const rows = catalog.lessons.filter((row) =>
    `${row.title} ${row.category} ${row.question}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <section className="workspace-hero">
        <div className="max-w-2xl">
          <p className="eyebrow">LEARN / EXPERIMENT / EXPLAIN</p>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
            Your supply-chain learning sandbox
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--secondary)]">
            Make a prediction. Change the operating assumptions. Follow the stock, orders and
            service through the network, then use evidence to explain the trade-off.
          </p>
        </div>
        <div className="hero-stat">
          <BookOpen size={28} />
          <span>{catalog.lessons.length} guided experiments · editable A/B</span>
          <span>Synthetic inputs · actual engine results</span>
        </div>
      </section>
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Learning workspace"
        onKeyDown={(event) => {
          const ids = ["experiments", "explorer", "reference"];
          const position = ids.indexOf(tab);
          const index =
            event.key === "ArrowRight"
              ? (position + 1) % ids.length
              : event.key === "ArrowLeft"
                ? (position + ids.length - 1) % ids.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? ids.length - 1
                    : -1;
          if (index >= 0) {
            event.preventDefault();
            setTab(ids[index]!);
            document.getElementById(`tab-${ids[index]}`)?.focus();
          }
        }}
      >
        {[
          ["experiments", "Guided experiments"],
          ["explorer", "Visual explorer"],
          ["reference", "Concept reference"],
        ].map(([id, label]) => (
          <Button
            key={id}
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            aria-selected={tab === id}
            aria-controls={`learning-${id}`}
            id={`tab-${id}`}
            variant={tab === id ? "default" : "outline"}
            onClick={() => setTab(id!)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div
        hidden={tab !== "experiments"}
        role="tabpanel"
        id="learning-experiments"
        aria-labelledby="tab-experiments"
        className="space-y-5"
      >
        <section className="panel p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="lab-field">
              <span>Find a concept</span>
              <input
                aria-label="Find learning concept"
                placeholder="Inventory, forecast, capacity…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="lab-field">
              <span>Guided experiment</span>
              <select
                aria-label="Guided experiment"
                value={selected.id}
                onChange={(e) => {
                  set({ lesson: e.target.value });
                  setRuns(undefined);
                }}
              >
                {(rows.some((row) => row.id === selected.id) ? rows : [selected, ...rows]).map(
                  (row) => (
                    <option key={row.id} value={row.id}>
                      {row.category} · {row.title}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <p className="lab-help">
            {rows.length} matching concepts. The selected lesson remains available while filtering.
          </p>
        </section>
        <LearningExperiment
          key={selected.id}
          lesson={selected}
          setRuns={setRuns}
          explore={() => setTab("explorer")}
        />
      </div>
      {tab === "explorer" && (
        <div role="tabpanel" id="learning-explorer" aria-labelledby="tab-explorer">
          <LearningExplorer runs={runs} />
        </div>
      )}
      {tab === "reference" && (
        <div
          role="tabpanel"
          id="learning-reference"
          aria-labelledby="tab-reference"
          className="space-y-5"
        >
          <section className="panel p-5">
            <h2 className="text-lg font-semibold">Inside one simulation day</h2>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--accent)]">
              <a href="/reference/learning">Download student & instructor guide</a>
              <a href="/reference/parameters">Parameter sources</a>
              <a href="/reference/assumptions">Model assumptions</a>
            </div>
            <p className="lab-help">
              The sequence is fixed. Inventory and pipeline plots show closing states; forecasts are
              logged before today's demand. Arrow order explains why a new order cannot serve demand
              earlier in the same day.
            </p>
            <ol className="mt-5 grid gap-4 md:grid-cols-3">
              {catalog.daily_steps.map((step, i) => (
                <li className="rounded-lg border border-[var(--border)] p-4" key={step.title}>
                  <span className="mono text-[var(--accent)]">0{i + 1} →</span>
                  <h3 className="mt-2 font-medium">{step.title}</h3>
                  <p className="lab-help">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            {catalog.glossary.map((row) => (
              <article className="panel p-5" key={row.term}>
                <h3 className="font-semibold">{row.term}</h3>
                <p className="lab-help">{row.definition}</p>
              </article>
            ))}
          </div>
          <section className="panel p-5">
            <h2 className="font-semibold">Continue into the analytical labs</h2>
            <p className="lab-help">
              Explore the EOQ cost curve, service targets, network design, bullwhip and disruption
              recovery. Recorded experiments retain their source manifests; their figures are
              separate from your new simulation.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["inventory", "Inventory & EOQ"],
                  ["network", "Network design"],
                  ["bullwhip", "Bullwhip"],
                  ["resilience", "Resilience"],
                  ["methodology", "Formulas & validation"],
                ] as const
              ).map(([view, label]) => (
                <Button key={view} variant="outline" onClick={() => set({ view })}>
                  {label}
                  <ArrowRight />
                </Button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LearningExperiment({
  lesson,
  setRuns,
  explore,
}: {
  lesson: Lesson;
  setRuns: (value: { a: string; b: string }) => void;
  explore: () => void;
}) {
  const { set } = useTower();
  const cache = useQueryClient();
  const [a, setA] = useState<Request>(() => structuredClone(lesson.request_a) as Request);
  const [b, setB] = useState<Request>(() => structuredClone(lesson.request_b) as Request);
  const key = `openscm-learning-v1:${lesson.id}`;
  const [notebook, setNotebook] = useState(() => {
    try {
      return readNotebook(localStorage.getItem(key));
    } catch {
      return readNotebook(null);
    }
  });
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(notebook));
      setStorageError("");
    } catch {
      setStorageError("Browser storage is unavailable. Export your notebook before leaving.");
    }
  }, [key, notebook]);
  const [goal, setGoal] = useState(catalog.service_goal);
  const [editing, setEditing] = useState<"a" | "b">("b");
  const api = useQuery({
    queryKey: ["lab-catalog"],
    queryFn: async () => read(await client.GET("/lab")),
  });
  const paired =
    a.seed === b.seed &&
    a.replications === b.replications &&
    a.overrides?.warmup_days === b.overrides?.warmup_days &&
    a.overrides?.horizon_days === b.overrides?.horizon_days;
  const launch = useMutation({
    mutationFn: async (input: { a: Request; b: Request; prediction: string }) => {
      const requests = await Promise.all(
        [input.a, input.b].map(async (body) => read(await client.POST("/lab/validate", { body }))),
      );
      const statuses = await Promise.all(
        requests.map(async (body) => read(await client.POST("/runs", { body }))),
      );
      return { input, requests, statuses };
    },
    onSuccess: (result) =>
      setRuns({ a: result.statuses[0]!.run_id, b: result.statuses[1]!.run_id }),
  });
  const submission = launch.data;
  const statuses = useQueries({
    queries: (submission?.statuses ?? []).map((initial) => ({
      queryKey: ["learning-status", initial.run_id],
      queryFn: async () =>
        read(await client.GET("/runs/{run_id}", { params: { path: { run_id: initial.run_id } } })),
      initialData: initial,
      refetchInterval: (query: { state: { data: Schema["RunStatus"] | undefined } }) =>
        ["queued", "running"].includes(query.state.data?.status ?? "") ? 500 : (false as const),
    })),
  });
  const complete =
    statuses.length === 2 && statuses.every((row) => row.data?.status === "complete");
  const result = useQuery({
    queryKey: ["learning-result", submission?.statuses.map((row) => row.run_id)],
    enabled: complete,
    queryFn: async (): Promise<LearningResult> => {
      const [idA, idB] = submission!.statuses.map((row) => row.run_id);
      const [comparison, kpisA, kpisB, pA, pB] = await Promise.all([
        client.GET("/compare", { params: { query: { a: idA!, b: idB! } } }),
        client.GET("/runs/{run_id}/kpis", { params: { path: { run_id: idA! } } }),
        client.GET("/runs/{run_id}/kpis", { params: { path: { run_id: idB! } } }),
        client.GET("/runs/{run_id}/provenance", { params: { path: { run_id: idA! } } }),
        client.GET("/runs/{run_id}/provenance", { params: { path: { run_id: idB! } } }),
      ]);
      return {
        comparison: read(comparison),
        a: read(kpisA),
        b: read(kpisB),
        provenance: [read(pA), read(pB)],
      };
    },
  });
  const persist = useMutation({
    mutationFn: async () =>
      read(
        await client.POST("/portfolio", {
          body: {
            name: `Learning: ${lesson.title}`,
            notes: `${lesson.assumption}\nPrediction: ${notebook.prediction}\nReflection: ${notebook.reflection}`,
            request: b,
          },
        }),
      ),
    onSuccess: (saved) => {
      void cache.invalidateQueries({ queryKey: ["portfolio"] });
      set({ view: "portfolio", portfolio: saved.id });
    },
  });
  const busy =
    launch.isPending ||
    statuses.some((row) => ["queued", "running"].includes(row.data?.status ?? ""));
  const stale =
    submission &&
    (JSON.stringify(submission.input.a) !== JSON.stringify(a) ||
      JSON.stringify(submission.input.b) !== JSON.stringify(b));
  const changed = requestDifferences(a, b);
  const error =
    launch.error ?? persist.error ?? result.error ?? statuses.find((row) => row.error)?.error;
  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <p className="eyebrow">01 / UNDERSTAND · {lesson.category}</p>
        <h2 className="mt-3 text-xl font-semibold">{lesson.title}</h2>
        <p className="mt-3 text-base">{lesson.question}</p>
        <p className="mt-3 text-sm leading-7 text-[var(--secondary)]">{lesson.mechanism}</p>
        <p className="lab-help">{lesson.assumption} Custom edits below can change the exercise.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {lesson.watch.map((metric) => (
            <span className="module-tag" key={metric}>
              {metric.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      </section>
      <section className="panel p-5">
        <p className="eyebrow">02 / PREDICT</p>
        <label className="lab-field mt-3">
          <span>Your prediction and reasoning</span>
          <textarea
            aria-label="Student prediction"
            rows={3}
            maxLength={4000}
            value={notebook.prediction}
            placeholder="I expect B to… because… I would check…"
            onChange={(e) => setNotebook({ ...notebook, prediction: e.target.value })}
          />
        </label>
        <p className="lab-help">
          Notebook text is saved in this browser per lesson. Results and custom inputs last for this
          open lesson; export evidence or save B in Planning Lab before switching lessons. No
          automated grades.
        </p>
        {storageError && <p role="alert">{storageError}</p>}
      </section>
      <section className="panel p-5">
        <p className="eyebrow">03 / DESIGN & SIMULATE</p>
        <h2 className="mt-3 text-base font-semibold">What changes between A and B?</h2>
        <p className="lab-help">
          Only differing request fields appear below. Inherited values are resolved by the server;
          the evidence export contains complete operating snapshots. More than one changed input can
          confound interpretation.
        </p>
        <div className="my-4 max-h-64 overflow-auto">
          <table className="operations-table" aria-label="Changed experiment inputs">
            <thead>
              <tr>
                <th>Input</th>
                <th>A · control</th>
                <th>B · alternative</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((row) => (
                <tr key={row.input}>
                  <td className="mono break-all">{row.input}</td>
                  <td className="mono break-all">{row.a}</td>
                  <td className="mono break-all">{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!changed.length && (
            <p className="p-3 text-sm">Identical requests: useful as a reproducibility check.</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Numeric
            label="Paired root seed"
            value={a.seed}
            max={4294967295}
            step={1}
            change={(seed) => {
              setA({ ...a, seed });
              setB({ ...b, seed });
            }}
          />
          <Numeric
            label="Paired replications"
            value={a.replications}
            min={1}
            max={api.data?.max_replications ?? 30}
            step={1}
            change={(replications) => {
              setA({ ...a, replications });
              setB({ ...b, replications });
            }}
          />
          <Numeric
            label="Learning fill-rate goal (fraction)"
            value={goal}
            max={1}
            change={setGoal}
          />
        </div>
        <details className="my-4 rounded-lg border border-[var(--border)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Customise A and B assumptions
          </summary>
          <label className="field my-4">
            Edit condition
            <select
              aria-label="Edit learning condition"
              value={editing}
              onChange={(e) => setEditing(e.target.value as "a" | "b")}
            >
              <option value="a">A · control</option>
              <option value="b">B · alternative</option>
            </select>
          </label>
          {api.data ? (
            <LabControls
              key={editing}
              request={editing === "a" ? a : b}
              change={editing === "a" ? setA : setB}
              catalog={api.data}
            />
          ) : (
            <p className="lab-help">
              Connect to the simulation API to load supplier and SKU controls.
            </p>
          )}
        </details>
        {!paired && (
          <p role="alert" className="mb-3">
            Paired comparison requires matching seeds, replication counts and day windows.{" "}
            <Button
              variant="outline"
              onClick={() =>
                setB({
                  ...b,
                  seed: a.seed ?? 0,
                  replications: a.replications ?? 1,
                  overrides: {
                    ...b.overrides,
                    warmup_days: a.overrides?.warmup_days ?? null,
                    horizon_days: a.overrides?.horizon_days ?? null,
                  },
                })
              }
            >
              Match B experiment window to A
            </Button>
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy || !paired || !notebook.prediction.trim() || !api.data}
            loading={busy}
            onClick={() =>
              launch.mutate({
                a: structuredClone(a),
                b: structuredClone(b),
                prediction: notebook.prediction,
              })
            }
          >
            <FlaskConical />
            {busy ? "Simulating paired experiment…" : "Run learning experiment"}
          </Button>
          <Button
            variant="outline"
            disabled={persist.isPending || !api.data}
            loading={persist.isPending}
            onClick={() => persist.mutate()}
          >
            Save B in Planning Lab
            <ArrowRight />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              download(
                `learning-${lesson.id}.json`,
                JSON.stringify(
                  {
                    format: "openscm-learning-v1",
                    lesson: lesson.id,
                    assumption: lesson.assumption,
                    notebook,
                    learning_service_goal: goal,
                    current_draft: { a, b },
                    submitted: submission
                      ? {
                          requests: submission.requests,
                          prediction_at_launch: submission.input.prediction,
                          statuses: statuses.map((row) => row.data),
                        }
                      : null,
                    result: result.data ?? null,
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            <Download />
            Export notebook & evidence
          </Button>
        </div>
        {!notebook.prediction.trim() && (
          <p className="lab-help">
            Write a prediction before running. There is no required correct answer.
          </p>
        )}
        {api.error && (
          <p role="alert" aria-label="Learning API error" className="mt-3">
            {api.error.message} Start the local API for new experiments. The Visual explorer and
            Concept reference remain available.{" "}
            <Button variant="outline" onClick={() => void api.refetch()}>
              Retry simulation API
            </Button>
          </p>
        )}
        {error && (
          <p role="alert" aria-label="Learning experiment error" className="mt-3">
            {error.message}
            <Button variant="outline" onClick={() => void result.refetch()} disabled={!complete}>
              Retry result evidence
            </Button>
          </p>
        )}
        {statuses.length > 0 && (
          <p role="status" className="mono mt-4 text-xs">
            {statuses
              .map(
                (row, i) =>
                  `${i === 0 ? "A" : "B"}: ${row.data?.status ?? "loading"}${row.data?.error ? ` — ${row.data.error}` : ""}`,
              )
              .join(" · ")}
          </p>
        )}
      </section>
      {stale && (
        <p role="status" className="panel p-4 text-sm">
          Inputs changed. Results below belong to the submitted snapshots; run again to evaluate
          your current draft.
        </p>
      )}
      {complete && !result.data && !result.error && (
        <p role="status">Loading paired results and model provenance…</p>
      )}
      {complete && result.data && (
        <>
          <LearningResults result={result.data} goal={goal} />
          <div className="flex flex-wrap gap-3">
            <Button onClick={explore}>
              Explore daily A/B evidence
              <ArrowRight />
            </Button>
            <Button variant="outline" onClick={() => set({ view: lesson.related_view as ViewKey })}>
              Open related analytical lab
            </Button>
          </div>
          <RunExplanation runId={result.data.comparison.run_b} />
        </>
      )}
      <section className="panel p-5">
        <p className="eyebrow">05 / REFLECT & TRANSFER</p>
        <h2 className="mt-3 text-base font-semibold">{lesson.reflect}</h2>
        <label className="lab-field mt-4">
          <span>Evidence, explanation and next experiment</span>
          <textarea
            aria-label="Student reflection"
            rows={4}
            maxLength={4000}
            value={notebook.reflection}
            onChange={(e) => setNotebook({ ...notebook, reflection: e.target.value })}
            placeholder="Cite the run, metric, interval and observed mechanism. What would change in a real supply chain?"
          />
        </label>
        <p className="lab-help">
          Before real-world use: map units and topology, calibrate demand and lead times, validate
          held-out behaviour, and compare alternatives on independent seeds. Synthetic results are
          not operating recommendations.
        </p>
      </section>
    </div>
  );
}
