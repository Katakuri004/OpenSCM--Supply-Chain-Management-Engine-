import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Network,
  SlidersHorizontal,
  Activity,
  Package,
  ShieldCheck,
  BookOpen,
  Moon,
  Sun,
  Play,
  ArrowRight,
  GitCompareArrows,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { client, loadFixture, read } from "./lib/data";
import { useTower } from "./lib/state";
import requestDefaults from "./fixtures/request.json";
const ControlTower = lazy(() => import("./features/control-tower"));

export default function App() {
  const { mode, run, dark, set } = useTower();
  const [preset, setPreset] = useState("base_4dc");
  const [replications, setReplications] = useState(requestDefaults.replications);
  const [seed, setSeed] = useState(requestDefaults.seed);
  const [compareOpen, setCompareOpen] = useState(false);
  const [baseline, setBaseline] = useState("");
  const fixture = useQuery({
    queryKey: ["fixture"],
    queryFn: loadFixture,
    enabled: mode === "fixture",
  });
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => read(await client.GET("/scenarios")),
    enabled: mode === "live",
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
    enabled: mode === "live" && !!run,
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
    enabled: mode === "live" && status.data?.status === "complete",
  });
  const data = mode === "fixture" ? fixture.data : live.data;
  const comparison = useQuery({
    queryKey: ["comparison", baseline, run],
    queryFn: async () =>
      read(await client.GET("/compare", { params: { query: { a: baseline, b: run } } })),
    enabled:
      mode === "live" &&
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
    <div className="min-h-screen lg:grid lg:grid-cols-[196px_1fr]">
      <a className="skip" href="#main">
        Skip to Control Tower
      </a>
      <aside className="flex flex-col border-r border-[var(--border)] bg-[var(--panel)] px-4 py-6 max-lg:hidden">
        <a href="/" className="mb-1 flex items-center gap-2 px-2 font-semibold tracking-tight">
          <Network className="size-6 text-[var(--accent)]" />
          OpenSCM<span className="ml-auto text-[10px] text-[var(--secondary)]">STUDY</span>
        </a>
        <p className="mb-10 px-2 text-[10px] text-[var(--secondary)]">Supply chain operations</p>
        <p className="eyebrow mb-3 px-2">WORKSPACE</p>
        <nav aria-label="Study views" className="space-y-2">
          <a
            href="#main"
            aria-current="page"
            className="flex items-center gap-3 rounded-md bg-[var(--muted)] px-3 py-2.5 text-xs font-medium text-[var(--accent)]"
          >
            <Network size={16} />
            Control Tower
          </a>
          {[
            [SlidersHorizontal, "Scenario Lab"],
            [Network, "Network Design"],
            [Activity, "Bullwhip Lab"],
            [Package, "Inventory Lab"],
            [ShieldCheck, "Resilience"],
            [BookOpen, "Methodology"],
          ].map(([Icon, label]) => {
            const ViewIcon = Icon as typeof Network;
            return (
              <button
                key={String(label)}
                disabled
                title="Available in the next study milestone"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs text-[var(--secondary)] opacity-50"
              >
                <ViewIcon size={16} />
                {String(label)}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-[var(--border)] px-2 pt-5 text-[10px] leading-5 text-[var(--secondary)]">
          FMCG · India network
          <br />
          INR · daily simulation buckets
          <br />
          <span className="mono">
            {data?.network.warmup_days != null
              ? `${data.network.warmup_days} warm-up + ${data.health.days.length - data.network.warmup_days} measured`
              : "Daily study observations"}
          </span>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-6 py-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--secondary)]">Workspace</span>
            <ArrowRight size={12} />
            <span>Control Tower</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                      day: fixture.data?.network.warmup_days ?? fixture.data?.health.days[0] ?? 0,
                    })
              }
            >
              <Play />
              {busy ? "Running…" : mode === "fixture" ? "Reset study" : "Run"}
            </Button>
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
        <main id="main" tabIndex={-1} className="p-6">
          {mode === "live" && compareOpen && (
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
              <p className="eyebrow mb-2">OPERATIONS / NETWORK OVERVIEW</p>
              <h1 className="text-2xl font-semibold tracking-tight">Control Tower</h1>
              <p className="mt-2 text-xs text-[var(--secondary)]">
                Follow inventory, service and replenishment across every echelon.
              </p>
            </div>
            <div className="text-right text-[10px] leading-5 text-[var(--secondary)]">
              <span className="rounded border border-[var(--border)] px-2 py-1">
                {mode === "fixture" ? "RECORDED SIMULATION" : "LIVE STUDY SERVICE"}
              </span>
              <p className="mt-2">
                {data
                  ? `${data.network.kpis.replications} replications · 95% t intervals · representative trajectory`
                  : "Choose a scenario and run the study"}
              </p>
            </div>
          </div>
          {error && (
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
          {mode === "live" && status.data?.status === "failed" && (
            <div role="alert" className="panel mb-4 p-4">
              {status.data.error} Submit the run again to retry.
            </div>
          )}
          {data ? (
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
