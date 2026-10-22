import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Network, Moon, Sun, Play, ArrowRight, GitCompareArrows } from "lucide-react";
import { Button } from "./components/ui/button";
import { client, loadFixture, read } from "./lib/data";
import { useTower, viewNames } from "./lib/state";
import requestDefaults from "./fixtures/request.json";
import {
  WorkspaceSidebar,
  WorkspaceSearch,
  MobileNavigation,
} from "./components/workspace-navigation";
const StudyPage = lazy(() => import("./features/study-page"));
const ControlTower = lazy(() => import("./features/control-tower"));
const OperationsWorkspace = lazy(() => import("./features/operations-workspace"));
const Playbooks = lazy(() => import("./features/playbooks"));
const Portfolio = lazy(() => import("./features/portfolio"));
const LearningWorkspace = lazy(() => import("./features/learning-workspace"));

export default function App() {
  const { mode, run, dark, set, view } = useTower();
  const operationsView = view === "tower" || view === "overview" || view === "exceptions";
  const [preset, setPreset] = useState("base_4dc");
  const [replications, setReplications] = useState(requestDefaults.replications);
  const [seed, setSeed] = useState(requestDefaults.seed);
  const [compareOpen, setCompareOpen] = useState(false);
  const [baseline, setBaseline] = useState("");
  const fixture = useQuery({
    queryKey: ["fixture"],
    queryFn: loadFixture,
    enabled: mode === "fixture" && operationsView,
  });
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => read(await client.GET("/scenarios")),
    enabled: mode === "live" && operationsView,
  });
  const creation = useMutation({
    mutationFn: async () =>
      read(
        await client.POST("/runs", { body: { ...requestDefaults, preset, seed, replications } }),
      ),
    onSuccess: (status) => {
      if (run && run !== status.run_id) setBaseline(run);
      set({ run: status.run_id });
    },
  });
  const status = useQuery({
    queryKey: ["status", run],
    queryFn: async () =>
      read(await client.GET("/runs/{run_id}", { params: { path: { run_id: run } } })),
    enabled: mode === "live" && operationsView && !!run,
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.status ?? "queued") ? 500 : false,
  });
  const live = useQuery({
    queryKey: ["run", run],
    queryFn: async () => {
      const [network, health] = await Promise.all([
        client.GET("/runs/{run_id}/network", { params: { path: { run_id: run } } }),
        client.GET("/runs/{run_id}/health", { params: { path: { run_id: run } } }),
      ]);
      return { network: read(network), health: read(health) };
    },
    enabled: mode === "live" && operationsView && status.data?.status === "complete",
  });
  const data = mode === "fixture" ? fixture.data : live.data;
  const comparison = useQuery({
    queryKey: ["comparison", baseline, run],
    queryFn: async () =>
      read(await client.GET("/compare", { params: { query: { a: baseline, b: run } } })),
    enabled:
      mode === "live" &&
      view === "tower" &&
      compareOpen &&
      /^[a-f0-9]{64}$/.test(baseline) &&
      status.data?.status === "complete",
  });
  const error =
    creation.error ??
    (mode === "fixture"
      ? fixture.error
      : (catalog.error ?? status.error ?? live.error ?? comparison.error));
  const busy =
    creation.isPending ||
    (mode === "live" && ["queued", "running"].includes(status.data?.status ?? ""));
  const presets = mode === "fixture" ? fixture.data?.catalog.presets : catalog.data?.presets;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[224px_1fr]">
      <title>{`OpenSCM · ${viewNames[view]}`}</title>
      <a className="skip" href="#main">
        Skip to study content
      </a>
      <WorkspaceSidebar />
      <div className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-6 py-4">
          <div className="flex items-center gap-2 text-xs">
            <MobileNavigation />
            <span className="hidden text-[var(--secondary)] sm:inline">Planning workspace</span>
            <ArrowRight size={12} />
            <span>{viewNames[view]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WorkspaceSearch network={data?.network.network} />
            {view !== "portfolio" && view !== "learning" && (
              <select
                aria-label="Data source"
                value={mode}
                onChange={(event) => {
                  creation.reset();
                  set({ mode: event.target.value as "fixture" | "live", run: "" });
                }}
              >
                <option value="fixture">Recorded study</option>
                <option value="live">Live API</option>
              </select>
            )}
            {operationsView && (
              <>
                <select
                  aria-label="Scenario preset"
                  value={preset}
                  onChange={(event) => setPreset(event.target.value)}
                >
                  {Object.keys(presets ?? { base_4dc: {} }).map((name) => (
                    <option key={name} value={name}>
                      {name === "base_4dc" ? "Baseline · 4 DCs" : name}
                    </option>
                  ))}
                </select>
                {mode === "live" && (
                  <>
                    <label className="field">
                      Seed
                      <input
                        aria-label="Root seed"
                        className="w-24 mono"
                        type="number"
                        min={0}
                        max={4294967295}
                        value={seed}
                        onChange={(event) => setSeed(Number(event.target.value))}
                      />
                    </label>
                    <label className="field">
                      Runs
                      <input
                        aria-label="Replications"
                        className="w-16 mono"
                        type="number"
                        min={1}
                        max={30}
                        value={replications}
                        onChange={(event) => setReplications(Number(event.target.value))}
                      />
                    </label>
                  </>
                )}
                <Button
                  aria-label="Run scenario"
                  disabled={busy || (mode === "fixture" && !fixture.data)}
                  onClick={() =>
                    mode === "live"
                      ? creation.mutate()
                      : set({
                          day:
                            fixture.data?.network.warmup_days ?? fixture.data?.health.days[0] ?? 0,
                        })
                  }
                >
                  <Play />
                  {busy ? "Running…" : mode === "fixture" ? "Reset study" : "Run"}
                </Button>
                {view === "tower" && (
                  <Button
                    variant="outline"
                    aria-label="Toggle paired deltas"
                    aria-pressed={compareOpen}
                    disabled={mode === "fixture" || !live.data}
                    title="Compare the current run B against a cached baseline A"
                    onClick={() => setCompareOpen(!compareOpen)}
                  >
                    <GitCompareArrows />
                    A/B
                  </Button>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Light theme" : "Dark theme"}
              onClick={() => set({ dark: !dark })}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="workspace-main">
          {view === "tower" && mode === "live" && compareOpen && (
            <label className="field mb-4">
              Baseline run ID (A)
              <input
                className="mono w-full max-w-[640px]"
                aria-label="Baseline run ID"
                pattern="[a-f0-9]{64}"
                maxLength={64}
                placeholder="Paste a cached run ID with matching seeds and day windows"
                value={baseline}
                onChange={(event) => setBaseline(event.target.value)}
              />
            </label>
          )}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">
                OPENSCM / {operationsView ? "NETWORK OPERATIONS" : "PLANNING & SIMULATION"}
              </p>
              <h1 className="text-[28px] font-semibold tracking-tight">{viewNames[view]}</h1>
              <p className="mt-2 text-xs text-[var(--secondary)]">
                {view === "overview"
                  ? "A connected view of inventory, service exposure and your next operating decision."
                  : view === "exceptions"
                    ? "Prioritise service exceptions, review local observations and investigate the underlying inventory."
                    : view === "playbooks"
                      ? "Turn practical operations questions into transparent, repeatable simulation experiments."
                      : view === "tower"
                        ? "Follow inventory, service and replenishment across every echelon."
                        : "Explore supply-chain trade-offs with recorded experiments and explicit assumptions."}
              </p>
            </div>
            <div className="text-right text-[10px] leading-5 text-[var(--secondary)]">
              <span className="rounded border border-[var(--border)] px-2 py-1">
                {view === "learning"
                  ? "STUDENT SIMULATION WORKSPACE"
                  : view === "portfolio"
                    ? "SERVER PLANNING WORKSPACE"
                    : mode === "fixture"
                      ? "RECORDED SIMULATION"
                      : "LIVE STUDY SERVICE"}
              </span>
              <p className="mt-2">
                {view === "learning"
                  ? "Guided experiments · visible assumptions · actual engine evidence"
                  : view === "portfolio"
                    ? "Versioned assumptions · immutable launches · current simulation API"
                    : !operationsView
                      ? "Saved experiments · seeded representative trajectories"
                      : data
                        ? `${data.network.kpis.replications} replications · ${data.network.kpis.replications > 1 ? "95% t intervals" : "intervals unavailable"} · representative trajectory`
                        : "Choose a scenario and run the study"}
              </p>
            </div>
          </div>
          {operationsView && error && (
            <div
              role="alert"
              aria-label="Study service error"
              className="panel mb-4 flex items-center justify-between p-4 text-sm"
            >
              {error.message}
              <Button variant="outline" onClick={() => location.reload()}>
                Reload
              </Button>
            </div>
          )}
          {operationsView && mode === "live" && status.data?.status === "failed" && (
            <div role="alert" className="panel mb-4 p-4">
              {status.data.error} Submit the run again to retry.
            </div>
          )}
          {view === "learning" ? (
            <Suspense fallback={<p role="status">Loading learning sandbox…</p>}>
              <LearningWorkspace />
            </Suspense>
          ) : view === "portfolio" ? (
            <Suspense fallback={<p role="status">Loading planning lab…</p>}>
              <Portfolio />
            </Suspense>
          ) : view === "playbooks" ? (
            <Suspense fallback={<p role="status">Loading scenario playbooks…</p>}>
              <Playbooks />
            </Suspense>
          ) : !operationsView ? (
            <Suspense fallback={<p role="status">Loading study view…</p>}>
              <StudyPage view={view} />
            </Suspense>
          ) : data && (view === "overview" || view === "exceptions") ? (
            <Suspense fallback={<p role="status">Loading operations workspace…</p>}>
              <OperationsWorkspace network={data.network} health={data.health} view={view} />
            </Suspense>
          ) : data ? (
            <Suspense fallback={<div role="status">Loading network canvas…</div>}>
              <ControlTower
                key={`${mode}-${data.network.network.run_id}`}
                network={data.network}
                health={data.health}
                fixture={mode === "fixture" ? fixture.data : undefined}
                comparison={mode === "live" && compareOpen ? comparison.data : undefined}
              />
            </Suspense>
          ) : (
            <div className="panel grid min-h-[550px] place-items-center text-center">
              <div>
                <Network className="mx-auto mb-4 size-10 text-[var(--accent)]" />
                <h2 className="font-medium">
                  {busy
                    ? `Simulation ${status.data?.status ?? "starting"}`
                    : mode === "fixture"
                      ? "Loading recorded network…"
                      : "Your operations view starts with a run"}
                </h2>
                <p role="status" className="mt-3 text-xs text-[var(--secondary)]">
                  {busy
                    ? "Replications are processed in the background. This view updates when results are ready."
                    : "The network and full health matrix load together; daily scrubbing stays in your browser."}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
