import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play, PanelRightOpen, Search, X } from "lucide-react";
import NetworkCanvas from "../components/network";
import { Chart } from "../components/chart";
import { Sheet } from "../components/ui/sheet";
import { Button } from "../components/ui/button";
import { client, fixtureQuery, read, type Fixture } from "../lib/data";
import { csv, download, number, type Schema } from "../lib/tower";
import { useTower } from "../lib/state";

const KpiStrip = memo(function KpiStrip({
  kpis,
  series,
  dark,
  comparison,
}: {
  comparison: Schema["Comparison"] | undefined;
  kpis: Schema["Kpis"];
  series: Schema["TimeSeries"] | undefined;
  dark: boolean;
}) {
  const cards = [
    { key: "fill_rate", label: "CUSTOMER FILL RATE", percentage: true },
    { key: "cycle_service_level", label: "CYCLE SERVICE LEVEL", percentage: true },
    { key: "total_landed_cost_inr", label: "LANDED COST · INR", percentage: false },
    { key: "bullwhip_ratio", label: "WEEKLY BULLWHIP", percentage: false },
  ] as const;
  return (
    <section
      aria-label="Network KPI estimates"
      className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4"
    >
      {cards.map(({ key, label, percentage }) => {
        const estimate = kpis.metrics[key];
        const scale = percentage ? 100 : 1;
        const delta = comparison?.metrics[key]?.mean;
        return (
          <article key={key} className="panel min-h-[132px] p-4">
            <p className="eyebrow">{label}</p>
            <p className="mono mt-3 text-2xl tracking-tight">
              {number(
                estimate?.mean == null ? null : estimate.mean * scale,
                percentage ? 2 : key === "total_landed_cost_inr" ? 0 : 2,
              )}
              {percentage && estimate?.mean != null ? (
                <span className="ml-1 text-sm">%</span>
              ) : null}
            </p>
            <p className="mono mt-2 text-[10px] text-[var(--secondary)]">
              95% CI{" "}
              {estimate?.ci95
                ? estimate.ci95
                    .map((value) => number(value * scale, percentage ? 2 : 0))
                    .join(" – ")
                : "unavailable"}
            </p>
            {delta != null && (
              <p className="mono mt-2 text-[10px]" aria-label={`${label} paired delta`}>
                Δ B−A {delta > 0 ? "+" : ""}
                {number(delta * scale, 3)}
                {percentage ? " pp" : ""}
              </p>
            )}
            {key === "fill_rate" && series && (
              <div className="mt-2">
                <Chart series={series} day={90} dark={dark} spark />
                <p className="text-[9px] text-[var(--secondary)]">
                  {series.node_id} / {series.sku_id} · daily fill trajectory
                </p>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
});

export default function ControlTower({
  network,
  health,
  fixture,
  comparison,
}: {
  comparison: Schema["Comparison"] | undefined;
  network: Schema["RunNetwork"];
  health: Schema["Health"];
  fixture: Fixture | undefined;
}) {
  const { day, node, dark, set } = useTower();
  const [drawer, setDrawer] = useState(false);
  const [sku, setSku] = useState(fixture?.sku ?? network.sku_ids[0]!);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [phrase, setPhrase] = useState("");
  const [results, setResults] = useState<Schema["QueryResults"] | null>(null);
  const [queryError, setQueryError] = useState("");
  const [querying, setQuerying] = useState(false);
  const runId = network.network.run_id;
  const warmup = network.warmup_days;
  const nodeIndex = network.network.nodes.id.indexOf(node);
  const currentNode = nodeIndex < 0 ? network.network.nodes.id[0]! : node;
  const dayIndex = health.days.indexOf(day);
  const row = health.node_ids.indexOf(currentNode);
  const stockouts = health.stockout.filter((flags) => flags[dayIndex]).length;
  useEffect(() => {
    if (dayIndex < 0)
      set({ day: warmup != null && health.days.includes(warmup) ? warmup : health.days[0]! });
    if (nodeIndex < 0) set({ node: currentNode });
  }, [dayIndex, nodeIndex, currentNode, health, warmup, set]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = useTower.getState().day;
      const i = health.days.indexOf(current);
      if (i === health.days.length - 1) {
        setPlaying(false);
        return;
      }
      set({ day: health.days[i + 1]! });
    }, 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, health, set]);
  useEffect(() => {
    setResults(null);
    setQueryError("");
  }, [day]);
  const seriesQuery = useQuery({
    queryKey: ["series", runId, currentNode, sku],
    queryFn: async () =>
      read(
        await client.GET("/runs/{run_id}/timeseries", {
          params: { path: { run_id: runId }, query: { node: currentNode, sku, start_day: 0 } },
        }),
      ),
    enabled: !fixture && drawer,
  });
  const nodeKpis = useQuery({
    queryKey: ["kpis", runId, currentNode],
    queryFn: async () =>
      read(
        await client.GET("/runs/{run_id}/kpis", {
          params: { path: { run_id: runId }, query: { node: currentNode } },
        }),
      ),
    enabled: !fixture && drawer,
  });
  const spark = useQuery({
    queryKey: ["series", runId, "R01", network.sku_ids[0]],
    queryFn: async () =>
      read(
        await client.GET("/runs/{run_id}/timeseries", {
          params: {
            path: { run_id: runId },
            query: { node: "R01", sku: network.sku_ids[0]!, start_day: 0 },
          },
        }),
      ),
    enabled: !fixture,
  });
  const series = fixture?.series[currentNode] ?? seriesQuery.data;
  const estimates = fixture?.kpis[currentNode] ?? nodeKpis.data;
  const matches = useMemo(() => results?.node_ids ?? null, [results]);
  const apply = async (request: Schema["QueryRequest"]) => {
    setQuerying(true);
    setQueryError("");
    try {
      const response = fixture
        ? fixtureQuery(fixture, request, day)
        : read(
            await client.POST("/runs/{run_id}/query", {
              params: { path: { run_id: runId } },
              body: { ...request, day },
            }),
          );
      if (useTower.getState().day === day) setResults(response);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "Node query failed");
      setResults(null);
    } finally {
      setQuerying(false);
    }
  };
  const skuIndex = network.sku_ids.indexOf(sku);
  const reorder =
    network.policy?.reorder_point[skuIndex]?.[network.network.nodes.id.indexOf(currentNode)];
  const quantity =
    network.policy?.order_quantity[skuIndex]?.[network.network.nodes.id.indexOf(currentNode)];
  return (
    <>
      <KpiStrip
        kpis={network.kpis}
        series={fixture?.series.R01 ?? spark.data}
        dark={dark}
        comparison={comparison}
      />
      <section className="panel overflow-hidden" aria-label="Supply network and day controls">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Supply network</h2>
            <p className="mt-1 text-[10px] text-[var(--secondary)]">
              {network.network.nodes.id.length} nodes · {network.network.edges.id.length} lanes ·
              width ∝ √measured flow
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--secondary)]">
              ◇ Supplier　□ DC　○ Retailer　⬡ B2B
            </span>
            <label className="field sr-only" htmlFor="node-select">
              Inspect node
            </label>
            <select
              id="node-select"
              aria-label="Inspect node"
              value={currentNode}
              onChange={(event) => set({ node: event.target.value })}
            >
              {network.network.nodes.id.map((id, i) => (
                <option key={id} value={id}>
                  {id} · {network.network.nodes.label[i]}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open inspector"
              onClick={() => setDrawer(true)}
            >
              <PanelRightOpen />
            </Button>
          </div>
        </div>
        <div className="flex h-[560px] flex-col">
          <NetworkCanvas
            network={network.network}
            health={health}
            day={day}
            matches={matches}
            selected={currentNode}
            dark={dark}
            onSelect={(id) => {
              set({ node: id });
              setDrawer(true);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-[10px] text-[var(--secondary)]">
          <div className="flex items-center gap-2">
            <span>Days of cover</span>
            {["#e2eaf2", "#b3c9dc", "#7da3c4", "#3d6d98"].map((color) => (
              <span key={color} className="h-2 w-5" style={{ background: color }} />
            ))}
            <span>0 → 21+</span>
            <span className="ml-3 text-[#C2410C]">! Stockout / backlog</span>
            <span>Grey = unavailable</span>
          </div>
          <span className="mono">{stockouts} nodes with stockout / backlog</span>
        </div>
        <div className="flex items-center gap-4 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-4">
          <Button
            size="icon"
            variant="outline"
            aria-label={playing ? "Pause playback" : "Play playback"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <label className="field">
            Speed
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              {[1, 2, 4, 8].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-[10px] text-[var(--secondary)]">
              <span>Day {health.days[0]} · includes warm-up</span>
              <span>Day {health.days.at(-1)}</span>
            </div>
            <input
              className="w-full"
              aria-label="Simulation day"
              type="range"
              min={health.days[0]}
              max={health.days.at(-1)}
              step={1}
              value={day}
              onChange={(event) => set({ day: Number(event.target.value) })}
            />
          </div>
          <output className="mono min-w-20 text-right text-sm" aria-live="off">
            DAY {day}
            <span className="block text-[9px] text-[var(--secondary)]">
              {warmup == null ? "SIMULATION" : day < warmup ? "WARM-UP" : "MEASURED"}
            </span>
          </output>
        </div>
      </section>
      <section className="panel mt-5 p-5" aria-label="Node query">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Find nodes</h2>
          <span className="text-[10px] text-[var(--secondary)]">
            Filters apply to day {day}; scrub to clear.
          </span>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void apply({ text: phrase });
          }}
        >
          <Search className="my-auto size-4 text-[var(--secondary)]" />
          <input
            aria-label="Query phrase"
            className="flex-1"
            placeholder="warehouses with days of cover < 7"
            maxLength={200}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
          <Button type="submit" disabled={querying || !phrase.trim()} aria-label="Apply query">
            Apply filter
          </Button>
          {results && (
            <Button variant="ghost" aria-label="Clear query" onClick={() => setResults(null)}>
              <X />
            </Button>
          )}
        </form>
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            disabled={querying}
            onClick={() =>
              void apply({
                filter: { node_type: "dc", metric: "days_of_cover", operator: "lt", value: 7 },
              })
            }
          >
            DC cover &lt; 7 days
          </Button>
          <Button
            variant="outline"
            disabled={querying}
            onClick={() =>
              void apply({
                filter: { node_type: "retailer", metric: "fill_rate", operator: "lt", value: 0.95 },
              })
            }
          >
            Retailer fill &lt; 95%
          </Button>
        </div>
        {queryError && (
          <p role="alert" className="mt-3 text-sm">
            {queryError}
          </p>
        )}
        {results && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p role="status" className="text-xs">
                {results.node_ids.length} matching nodes ·{" "}
                {results.filter.metric.replaceAll("_", " ")}
              </p>
              <Button
                variant="ghost"
                onClick={() =>
                  download(
                    "node-query.csv",
                    csv([
                      ["node", "echelon", results.filter.metric],
                      ...results.node_ids.map((id, i) => [
                        id,
                        results.node_types[i]!,
                        results.values[i]!,
                      ]),
                    ]),
                  )
                }
              >
                CSV ↓
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table aria-label="Query matches" className="w-full text-left text-xs">
                <thead className="text-[var(--secondary)]">
                  <tr>
                    <th className="py-2">Node</th>
                    <th>Echelon</th>
                    <th>Value</th>
                    <th>
                      <span className="sr-only">Inspect</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.node_ids.map((id, i) => (
                    <tr key={id} className="border-t border-[var(--border)]">
                      <td className="mono py-2">{id}</td>
                      <td>{results.node_types[i]}</td>
                      <td className="mono">{number(results.values[i], 3)}</td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            set({ node: id });
                            setDrawer(true);
                          }}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <p className="mt-4 text-[10px] leading-5 text-[var(--secondary)]">
        Synthetic operations study · Health and lane flows show the first replication; cards
        summarize the measured horizon. Colour indicates coverage; ! identifies stockout or backlog.{" "}
        {fixture
          ? `Recorded inspectors contain ${fixture.sku}; switch to Live API for all SKUs.`
          : "Replenishment policies and accounting assumptions follow the study configuration."}
      </p>
      <Sheet
        open={drawer}
        onOpenChange={setDrawer}
        title={network.network.nodes.label[network.network.nodes.id.indexOf(currentNode)]!}
      >
        <div className="mt-5 flex items-center justify-between">
          <span className="mono text-xs">
            {currentNode} ·{" "}
            {network.network.nodes.type[network.network.nodes.id.indexOf(currentNode)]}
          </span>
          <label className="field">
            SKU
            <select
              aria-label="Inspector SKU"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            >
              {(fixture ? [fixture.sku] : network.sku_ids).map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="my-5 grid grid-cols-3 gap-3">
          {[
            ["DAYS OF COVER", number(health.days_of_cover[row]?.[dayIndex])],
            [
              "FILL RATE",
              estimates?.metrics.fill_rate?.mean == null
                ? "—"
                : `${number(estimates.metrics.fill_rate.mean * 100, 2)}%`,
            ],
            ["NODE COST · INR", number(estimates?.metrics.total_landed_cost_inr?.mean, 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-[var(--border)] p-3">
              <p className="eyebrow">{label}</p>
              <p className="mono mt-2 text-sm">{value}</p>
            </div>
          ))}
        </div>
        <h3 className="text-sm font-semibold">Inventory balances · units</h3>
        <p className="mt-1 text-[10px] text-[var(--secondary)]">
          {sku} · day {day} · nominal initial ROP/Q reference lines
        </p>
        {series ? (
          <Chart series={series} day={day} reorder={reorder} quantity={quantity} dark={dark} />
        ) : (
          <p role="status" className="py-10 text-sm">
            {seriesQuery.error?.message ?? "Loading inventory observations…"}
          </p>
        )}
        {nodeKpis.error && <p role="alert">{nodeKpis.error.message}</p>}
        <p className="mt-4 text-xs leading-6 text-[var(--secondary)]">
          Inventory position = on hand + on order − backorders. Fill rate and cost above are
          replication estimates; coverage is the selected day's aggregate node observation. Nominal
          targets are initial policy references and may differ from adaptive daily targets.
        </p>
        {series && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {["on_hand", "on_order", "backorders"].map((metric) => (
              <div key={metric} className="panel p-3">
                <p className="text-[var(--secondary)]">{metric.replaceAll("_", " ")}</p>
                <p className="mono mt-2">
                  {number(series.metrics[metric as "on_hand"]?.[series.days.indexOf(day)], 0)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
