import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, FlaskConical, Plus, Save } from "lucide-react";
import { Button } from "../components/ui/button";
import { StudyPlot } from "../components/study-plot";
import { client, read } from "../lib/data";
import { useTower } from "../lib/state";
import { download, number, type Schema } from "../lib/tower";
import { colors } from "../lib/labs";
import LabControls from "./lab-controls";
import RunExplanation from "./run-explanation";

type Saved = Schema["SavedScenario"];
type Request = Schema["RunRequest"];
export default function Portfolio() {
  const { portfolio, set } = useTower();
  const [baseline, setBaseline] = useState("");
  const catalog = useQuery({
    queryKey: ["lab-catalog"],
    queryFn: async () => read(await client.GET("/lab")),
  });
  const saved = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => read(await client.GET("/portfolio")),
  });
  if (catalog.error || saved.error)
    return (
      <div role="alert" className="panel p-6 text-sm">
        {(catalog.error ?? saved.error)?.message} Start the local simulation API to use the
        server-backed planning workspace.
        <Button
          className="ml-3"
          variant="outline"
          onClick={() => {
            void catalog.refetch();
            void saved.refetch();
          }}
        >
          Retry connection
        </Button>
      </div>
    );
  if (!catalog.data || !saved.data)
    return <p role="status">Loading saved scenarios and model assumptions…</p>;
  const selected = saved.data.find((row) => row.id === portfolio);
  return (
    <div className="space-y-5">
      <section className="workspace-callout">
        <div>
          <p className="eyebrow">SCENARIO PORTFOLIO / SELF-HOSTED WORKSPACE</p>
          <h2 className="mt-2 text-xl font-semibold">
            Design, simulate, compare. Keep the evidence.
          </h2>
          <p className="mt-2 text-xs leading-6 text-[var(--secondary)]">
            Named scenario revisions, planning notes and immutable launch history live on this API
            server. Assumptions are synthetic until calibrated; no live ERP feed is required.
          </p>
        </div>
        <Button aria-label="New scenario" onClick={() => set({ portfolio: "" })}>
          <Plus />
          New scenario
        </Button>
      </section>
      <section className="panel flex flex-wrap items-center gap-3 p-4">
        <label className="field flex-1">
          Saved scenario
          <select
            className="min-w-0 flex-1"
            aria-label="Saved scenario"
            value={portfolio}
            onChange={(event) => set({ portfolio: event.target.value })}
          >
            <option value="">New configuration</option>
            {saved.data.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · r{row.revision}
              </option>
            ))}
          </select>
        </label>
        <span className="mono text-xs text-[var(--secondary)]">
          {saved.data.length} saved configurations
        </span>
      </section>
      {portfolio && !selected ? (
        <p role="alert" className="panel p-5">
          This scenario is not available on this server. Select another saved scenario or create a
          new configuration.
        </p>
      ) : (
        <Editor
          key={portfolio || "new"}
          initial={selected}
          catalog={catalog.data}
          baseline={baseline}
          setBaseline={setBaseline}
        />
      )}
    </div>
  );
}

function Editor({
  initial,
  catalog,
  baseline,
  setBaseline,
}: {
  initial: Saved | undefined;
  catalog: Schema["LabCatalog"];
  baseline: string;
  setBaseline: (value: string) => void;
}) {
  const cache = useQueryClient();
  const { set } = useTower();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "New planning scenario");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [request, setRequest] = useState<Request>(
    structuredClone(initial?.request ?? catalog.request),
  );
  const [json, setJson] = useState("");
  const [importError, setImportError] = useState("");
  const dirty =
    !saved ||
    name !== saved.name ||
    notes !== saved.notes ||
    JSON.stringify(request) !== JSON.stringify(saved.request);
  const persist = useMutation({
    mutationFn: async (clone: boolean) => {
      const body = { name, notes, request };
      return saved && !clone
        ? read(
            await client.PUT("/portfolio/{scenario_id}", {
              params: { path: { scenario_id: saved.id } },
              body: { ...body, revision: saved.revision },
            }),
          )
        : read(await client.POST("/portfolio", { body }));
    },
    onSuccess: (value) => {
      cache.setQueryData<Saved[]>(["portfolio"], (previous) => [
        value,
        ...(previous ?? []).filter((row) => row.id !== value.id),
      ]);
      setSaved(value);
      setName(value.name);
      setNotes(value.notes ?? "");
      setRequest(value.request);
      set({ portfolio: value.id });
    },
  });
  const history = useQuery({
    queryKey: ["portfolio-history", saved?.id],
    queryFn: async () =>
      read(
        await client.GET("/portfolio/{scenario_id}/runs", {
          params: { path: { scenario_id: saved!.id } },
        }),
      ),
    enabled: !!saved,
    refetchInterval: (query) =>
      query.state.data?.some((row) => ["queued", "running"].includes(row.status.status))
        ? 500
        : false,
  });
  const launch = useMutation({
    mutationFn: async (execution_id?: string) =>
      read(
        await client.POST("/portfolio/{scenario_id}/runs", {
          params: { path: { scenario_id: saved!.id } },
          body: { revision: saved!.revision, ...(execution_id ? { execution_id } : {}) },
        }),
      ),
    onSuccess: (execution) => {
      cache.setQueryData<Schema["PortfolioExecution"][]>(
        ["portfolio-history", saved!.id],
        (previous) => [execution, ...(previous ?? [])],
      );
      void cache.invalidateQueries({ queryKey: ["portfolio-history", saved!.id] });
    },
  });
  const latest = history.data?.[0];
  const completed = history.data?.find((row) => row.status.status === "complete");
  const runB = completed?.status.run_id ?? "";
  const compare = useMutation({
    mutationFn: async () => {
      const [delta, a, b] = await Promise.all([
        client.GET("/compare", { params: { query: { a: baseline, b: runB } } }),
        client.GET("/runs/{run_id}/kpis", { params: { path: { run_id: baseline } } }),
        client.GET("/runs/{run_id}/kpis", { params: { path: { run_id: runB } } }),
      ]);
      return { comparison: read(delta), a: read(a), b: read(b) };
    },
  });
  const validation = useMutation({
    mutationFn: async () =>
      read(await client.POST("/lab/validate", { body: JSON.parse(json) as Request })),
    onSuccess: (value) => {
      setRequest(value);
      setImportError("");
    },
  });
  const reload = useMutation({
    mutationFn: async () => read(await client.GET("/portfolio")),
    onSuccess: (rows) => {
      const current = rows.find((row) => row.id === saved?.id);
      if (current) {
        setSaved(current);
        setName(current.name);
        setNotes(current.notes ?? "");
        setRequest(current.request);
        cache.setQueryData(["portfolio"], rows);
      }
    },
  });
  const error =
    persist.error ??
    history.error ??
    launch.error ??
    compare.error ??
    validation.error ??
    reload.error;
  const comparison = compare.data?.comparison;
  const currentComparison = comparison?.run_a === baseline && comparison?.run_b === runB;
  const busy = persist.isPending || launch.isPending;
  return (
    <div className="space-y-5">
      <section className="panel p-5" data-testid="portfolio-editor">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">CONFIGURATION & MODEL ASSUMPTIONS</p>
            <p className="mt-2 text-xs text-[var(--secondary)]" data-testid="portfolio-revision">
              {saved ? `Revision ${saved.revision}` : "Unsaved configuration"}
            </p>
          </div>
          <span className="module-tag">{dirty ? "Unsaved changes" : "Saved on this server"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="lab-field">
            <span>Scenario name</span>
            <input
              aria-label="Scenario name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="lab-field">
            <span>Planning notes</span>
            <textarea
              aria-label="Planning notes"
              rows={2}
              maxLength={10000}
              value={notes}
              placeholder="State the operating question, assumptions and acceptance criteria."
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <LabControls request={request} change={setRequest} catalog={catalog} />
        <details className="mt-5 rounded-lg border border-[var(--border)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced request JSON / disruptions / SKU overrides
          </summary>
          <p className="lab-help">
            Use the full typed RunRequest: multiple event targets/timings, SKU
            demand/CV/cost/supplier overrides, and all policy inputs. Validation checks the actual
            model and targets without running a simulation.
          </p>
          <div className="my-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setJson(JSON.stringify(request, null, 2))}>
              Edit current request JSON
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(
                  "scenario-request.json",
                  JSON.stringify(request, null, 2),
                  "application/json",
                )
              }
            >
              Export request JSON
            </Button>
          </div>
          <textarea
            className="mono min-h-64 w-full text-xs"
            aria-label="Advanced scenario request JSON"
            value={json}
            onChange={(event) => setJson(event.target.value)}
          />
          <Button
            className="mt-3"
            variant="outline"
            disabled={!json.trim() || validation.isPending}
            loading={validation.isPending}
            onClick={() => {
              try {
                JSON.parse(json);
                setImportError("");
                validation.mutate();
              } catch {
                setImportError("Enter valid JSON before applying the request.");
              }
            }}
          >
            Validate and apply JSON
          </Button>
          {importError && (
            <p role="alert" className="mt-2 text-xs">
              {importError}
            </p>
          )}
        </details>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
          <Button
            aria-label="Save scenario"
            loading={persist.isPending}
            disabled={busy || !name.trim()}
            onClick={() => persist.mutate(false)}
          >
            <Save />
            Save scenario
          </Button>
          <Button
            variant="outline"
            aria-label="Save as new scenario"
            loading={persist.isPending}
            disabled={busy || !name.trim()}
            onClick={() => persist.mutate(true)}
          >
            <Copy />
            Save as new scenario
          </Button>
          <Button
            aria-label="Run saved scenario"
            loading={launch.isPending}
            disabled={
              busy || dirty || !saved || ["queued", "running"].includes(latest?.status.status ?? "")
            }
            onClick={() => launch.mutate(undefined)}
          >
            <FlaskConical />
            Run saved scenario <ArrowRight />
          </Button>
          {dirty && (
            <span className="text-xs text-[var(--secondary)]">Save changes before launching.</span>
          )}
        </div>
        {saved && (
          <Button
            className="mt-2"
            variant="ghost"
            disabled={reload.isPending}
            loading={reload.isPending}
            onClick={() => reload.mutate()}
          >
            Reload saved revision
          </Button>
        )}
      </section>
      {error && (
        <p role="alert" aria-label="Planning lab error" className="panel p-5 text-sm">
          {error.message}
        </p>
      )}
      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Immutable launch history</h2>
          {latest && (
            <span className="module-tag" data-testid="latest-run-status">
              {latest.status.status}
            </span>
          )}
        </div>
        <p className="mb-4 text-xs leading-6 text-[var(--secondary)]">
          Each launch keeps its request, revision and notes. Repeating a historical request uses the
          current engine/config fingerprints; identical cached runs can reuse results. Change seed
          for independent draws.
        </p>
        {!history.data?.length ? (
          <p className="text-sm text-[var(--secondary)]">
            Save and run a configuration to begin its history.
          </p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="operations-table" aria-label="Scenario launch history">
              <thead>
                <tr>
                  <th>Launched · local time</th>
                  <th>Revision</th>
                  <th>Status</th>
                  <th>Seed / runs</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Date(row.launched_at).toLocaleString()}
                      <span className="mono mt-1 block text-[9px] text-[var(--secondary)]">
                        {row.status.run_id.slice(0, 16)}
                      </span>
                    </td>
                    <td>{row.revision}</td>
                    <td>
                      {row.status.status}
                      {row.status.error && <p className="mt-1 text-xs">{row.status.error}</p>}
                    </td>
                    <td className="mono">
                      {row.request.seed} / {row.request.replications}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            download(
                              "execution-snapshot.json",
                              JSON.stringify(row, null, 2),
                              "application/json",
                            )
                          }
                        >
                          Snapshot
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || dirty}
                          onClick={() => launch.mutate(row.id)}
                        >
                          Repeat request
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {completed && (
        <>
          <section className="panel p-5">
            <h2 className="text-base font-semibold">Compare cost, service and inventory</h2>
            <p className="lab-help">
              B is this scenario's latest completed run. A and B must have matching replication
              seeds and day windows. Differences are B−A; intervals use paired replications.
            </p>
            <div className="my-4 flex flex-wrap items-center gap-3">
              <input
                className="mono min-w-0 flex-1"
                aria-label="Portfolio baseline run A"
                placeholder="Baseline run ID A"
                value={baseline}
                onChange={(event) => setBaseline(event.target.value)}
              />
              <Button
                variant="outline"
                aria-label="Use latest run as baseline A"
                onClick={() => setBaseline(runB)}
              >
                Use latest as A
              </Button>
              <Button
                aria-label="Compare selected runs"
                loading={compare.isPending}
                disabled={!/^[a-f0-9]{64}$/.test(baseline) || compare.isPending}
                onClick={() => compare.mutate()}
              >
                Compare selected runs
              </Button>
            </div>
            <p className="break-all text-[10px] text-[var(--secondary)]">B: {runB}</p>
            {currentComparison && comparison && compare.data && (
              <div
                data-testid="portfolio-comparison"
                data-run-a={baseline}
                data-run-b={runB}
                className="mt-5 space-y-4"
              >
                <div className="overflow-auto">
                  <table
                    className="operations-table"
                    aria-label="Paired cost service inventory comparison"
                  >
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>A</th>
                        <th>B</th>
                        <th>Δ B−A</th>
                        <th>95% paired interval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["fill_rate", "Customer fill · % / pp", 100],
                          ["total_landed_cost_inr", "Landed cost · INR", 1],
                          ["days_of_inventory", "Inventory · days", 1],
                          ["inventory_turns", "Inventory turns · annual", 1],
                        ] as const
                      ).map(([key, label, scale]) => {
                        const metric = comparison.metrics[key];
                        return (
                          <tr key={key}>
                            <td>{label}</td>
                            <td className="mono">
                              {number(
                                compare.data!.a.metrics[key]?.mean == null
                                  ? null
                                  : compare.data!.a.metrics[key]!.mean! * scale,
                                3,
                              )}
                            </td>
                            <td className="mono">
                              {number(
                                compare.data!.b.metrics[key]?.mean == null
                                  ? null
                                  : compare.data!.b.metrics[key]!.mean! * scale,
                                3,
                              )}
                            </td>
                            <td
                              className="mono"
                              {...(key === "total_landed_cost_inr"
                                ? {
                                    "data-testid": "portfolio-cost-delta",
                                    "data-value": String(metric?.mean),
                                  }
                                : {})}
                            >
                              {number(metric?.mean == null ? null : metric.mean * scale, 3)}
                            </td>
                            <td className="mono">
                              {metric?.ci95
                                ? metric.ci95.map((value) => number(value * scale, 3)).join(" – ")
                                : "Unavailable"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      "portfolio-comparison.json",
                      JSON.stringify(compare.data, null, 2),
                      "application/json",
                    )
                  }
                >
                  Download comparison evidence
                </Button>
              </div>
            )}
          </section>
          {currentComparison && comparison && (
            <StudyPlot
              title="Paired landed-cost accounts"
              source={`${comparison.replications} matched runs · full measured horizon · all eight ledger accounts; this is a cost comparison, not a causal attribution.`}
              rows={[
                ["component", "A_INR", "B_INR", "delta_INR"],
                ...comparison.costs.component.map((name, i) => [
                  name,
                  comparison.costs.a[i]!,
                  comparison.costs.b[i]!,
                  comparison.costs.delta[i]!,
                ]),
              ]}
              option={{
                legend: { top: 0, textStyle: { fontSize: 9, color: "#71717a" } },
                xAxis: { type: "category", data: ["A", "B"] },
                yAxis: { type: "value", name: "INR" },
                series: comparison.costs.component.map((name, i) => ({
                  type: "bar",
                  name: name.replaceAll("_", " "),
                  stack: "cost",
                  itemStyle: { color: colors[i]! },
                  data: [comparison.costs.a[i]!, comparison.costs.b[i]!],
                })),
              }}
            />
          )}
          <RunExplanation runId={runB} />
        </>
      )}
    </div>
  );
}
