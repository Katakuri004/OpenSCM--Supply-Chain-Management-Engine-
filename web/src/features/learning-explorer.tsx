import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudyPlot } from "../components/study-plot";
import { Button } from "../components/ui/button";
import { client, loadFixture, read, type Fixture } from "../lib/data";
import { seriesDefinitions, summarizeSeries, type SeriesMetric } from "../lib/learning";
import { number, type Schema } from "../lib/tower";
import { useTower } from "../lib/state";

export default function LearningExplorer({ runs }: { runs: { a: string; b: string } | undefined }) {
  const [source, setSource] = useState("recorded");
  const [draft, setDraft] = useState("");
  const [custom, setCustom] = useState("");
  const run = source === "a" ? runs?.a : source === "b" ? runs?.b : custom;
  const recorded = useQuery({
    queryKey: ["fixture"],
    queryFn: loadFixture,
    enabled: source === "recorded",
  });
  const live = useQuery({
    queryKey: ["learning-network", run],
    queryFn: async () => {
      const [network, health] = await Promise.all([
        client.GET("/runs/{run_id}/network", { params: { path: { run_id: run! } } }),
        client.GET("/runs/{run_id}/health", { params: { path: { run_id: run! } } }),
      ]);
      return { network: read(network), days: read(health).days };
    },
    enabled: source !== "recorded" && !!run,
  });
  const network = source === "recorded" ? recorded.data?.network : live.data?.network;
  const days = source === "recorded" ? recorded.data?.health.days : live.data?.days;
  const error = source === "recorded" ? recorded.error : live.error;
  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="text-lg font-semibold">Visual evidence explorer</h2>
        <p className="lab-help">
          Choose a facility, SKU, metric, chart and day range. Recorded evidence works without the
          API; current runs expose every SKU and ten daily series. A trajectory is one replication,
          not a confidence interval.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="field">
            Explorer source
            <select
              aria-label="Explorer source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="recorded">Recorded example</option>
              {runs && (
                <>
                  <option value="a">Experiment A</option>
                  <option value="b">Experiment B</option>
                </>
              )}
              <option value="custom">Completed run ID</option>
            </select>
          </label>
          {source === "custom" && (
            <>
              <input
                className="mono min-w-0 flex-1"
                aria-label="Explorer run ID"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="64-character completed run ID"
              />
              <Button disabled={!/^[a-f0-9]{64}$/.test(draft)} onClick={() => setCustom(draft)}>
                Load run evidence
              </Button>
            </>
          )}
        </div>
        {error && (
          <p role="alert" aria-label="Explorer error" className="mt-3 text-sm">
            {error.message}{" "}
            <Button
              variant="outline"
              onClick={() => void (source === "recorded" ? recorded.refetch() : live.refetch())}
            >
              Retry evidence
            </Button>
          </p>
        )}
      </section>
      {network && days ? (
        <Explorer
          key={`${source}-${network.network.run_id}`}
          network={network}
          observedDays={days}
          fixture={source === "recorded" ? recorded.data : undefined}
        />
      ) : (
        !error && (
          <p role="status">
            {source === "custom" && !run
              ? "Enter a completed run ID to explore its evidence."
              : "Loading evidence…"}
          </p>
        )
      )}
    </div>
  );
}

function Explorer({
  network,
  fixture,
  observedDays,
}: {
  network: Schema["RunNetwork"];
  fixture: Fixture | undefined;
  observedDays: number[];
}) {
  const { set } = useTower();
  const [node, setNode] = useState(
    network.network.nodes.id.includes("R01") ? "R01" : network.network.nodes.id[0]!,
  );
  const [sku, setSku] = useState(fixture?.sku ?? network.sku_ids[0]!);
  const [metric, setMetric] = useState<SeriesMetric>("on_hand");
  const [xMetric, setXMetric] = useState<SeriesMetric>("demand");
  const [kind, setKind] = useState("line");
  const warmup = network.warmup_days ?? observedDays[0]!;
  const [start, setStart] = useState(warmup);
  const last = observedDays.at(-1)!;
  const [end, setEnd] = useState(last);
  const [cursor, setCursor] = useState(warmup);
  const validRange =
    Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= last && start <= end;
  const metrics = [...new Set(kind === "scatter" ? [metric, xMetric] : [metric])];
  const query = useQuery({
    queryKey: ["learning-series", network.network.run_id, node, sku, metrics],
    queryFn: async () =>
      read(
        await client.GET("/runs/{run_id}/timeseries", {
          params: {
            path: { run_id: network.network.run_id },
            query: { node, sku, metrics, start_day: 0 },
          },
        }),
      ),
    enabled: !fixture,
  });
  const series = fixture?.series[node] ?? query.data;
  const available = Object.keys(
    fixture?.series[node]?.metrics ?? seriesDefinitions,
  ) as SeriesMetric[];
  const definition = seriesDefinitions[metric];
  const indexes = validRange
    ? (series?.days.flatMap((day, index) => (day >= start && day <= end ? [index] : [])) ?? [])
    : [];
  const days = indexes.map((i) => series!.days[i]!);
  const values = indexes.map((i) => series?.metrics[metric]?.[i] ?? null);
  const summary = summarizeSeries(values);
  const currentDay = Math.max(start, Math.min(end, cursor));
  const current = series?.days.indexOf(currentDay) ?? -1;
  const rows: (string | number | null)[][] = [
    ["day", ...metrics],
    ...indexes.map((i) => [
      series!.days[i]!,
      ...metrics.map((m) => series?.metrics[m]?.[i] ?? null),
    ]),
  ];
  let plot: { xAxis: object; yAxis: object; series: object[] } = {
    xAxis: {
      type: "category",
      data: days,
      name: "Simulation day",
      nameLocation: "middle",
      nameGap: 30,
    },
    yAxis: { type: "value", name: definition.unit },
    series: [
      {
        type: kind === "bar" ? "bar" : "line",
        data: values,
        showSymbol: false,
        connectNulls: false,
        markLine: {
          silent: true,
          data: [{ xAxis: days.indexOf(currentDay) }],
          label: { formatter: "Selected day" },
        },
      },
    ],
  };
  if (kind === "scatter")
    plot = {
      xAxis: {
        type: "value",
        name: `${seriesDefinitions[xMetric].label} (${seriesDefinitions[xMetric].unit})`,
        nameLocation: "middle",
        nameGap: 30,
      },
      yAxis: { type: "value", name: definition.unit },
      series: [
        {
          type: "scatter",
          data: indexes.flatMap((i) => {
            const x = series?.metrics[xMetric]?.[i],
              y = series?.metrics[metric]?.[i];
            return x == null || y == null ? [] : [[x, y, series!.days[i]]];
          }),
        },
      ],
    };
  if (kind === "distribution") {
    const low = summary.min ?? 0,
      width = summary.max === summary.min ? 1 : ((summary.max ?? 0) - low) / 10;
    const bins = Array.from({ length: summary.max === summary.min ? 1 : 10 }, (_, i) => ({
      low: low + i * width,
      count: 0,
    }));
    for (const value of values)
      if (value !== null)
        bins[Math.min(bins.length - 1, Math.floor((value - low) / width))]!.count++;
    const labels = bins.map((bin) => number(bin.low, 2));
    plot = {
      xAxis: {
        type: "category",
        data: labels,
        name: `${definition.unit} · bin lower edge`,
        nameLocation: "middle",
        nameGap: 30,
      },
      yAxis: { type: "value", name: "Observed days", minInterval: 1 },
      series: [{ type: "bar", data: bins.map((bin) => bin.count) }],
    };
  }
  return (
    <div className="space-y-5" data-testid="learning-explorer">
      <section className="panel p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="lab-field">
            <span>Facility</span>
            <select
              aria-label="Explorer facility"
              value={node}
              onChange={(e) => setNode(e.target.value)}
            >
              {network.network.nodes.id.map((id, i) => (
                <option key={id} value={id}>
                  {id} · {network.network.nodes.label[i]}
                </option>
              ))}
            </select>
          </label>
          <label className="lab-field">
            <span>SKU</span>
            <select aria-label="Explorer SKU" value={sku} onChange={(e) => setSku(e.target.value)}>
              {(fixture ? [fixture.sku] : network.sku_ids).map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <label className="lab-field">
            <span>Metric / Y axis</span>
            <select
              aria-label="Explorer metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as SeriesMetric)}
            >
              {available.map((id) => (
                <option key={id} value={id}>
                  {seriesDefinitions[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className="lab-field">
            <span>Chart</span>
            <select
              aria-label="Explorer chart"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                if (fixture) setXMetric("on_order");
              }}
            >
              <option value="line">Time trend</option>
              <option value="bar">Daily bars</option>
              <option value="distribution">Distribution</option>
              <option value="scatter">Relationship</option>
            </select>
          </label>
          {kind === "scatter" && (
            <label className="lab-field">
              <span>X axis</span>
              <select
                aria-label="Explorer X metric"
                value={xMetric}
                onChange={(e) => setXMetric(e.target.value as SeriesMetric)}
              >
                {available.map((id) => (
                  <option key={id} value={id}>
                    {seriesDefinitions[id].label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="lab-field">
            <span>From day</span>
            <input
              aria-label="Explorer from day"
              type="number"
              min={0}
              max={last}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </label>
          <label className="lab-field">
            <span>Through day</span>
            <input
              aria-label="Explorer through day"
              type="number"
              min={0}
              max={last}
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setStart(0);
              setEnd(last);
            }}
          >
            Include warm-up
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setStart(warmup);
              setEnd(last);
            }}
          >
            Measured window
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              set({
                view: "tower",
                mode: fixture ? "fixture" : "live",
                run: network.network.run_id,
                node,
                day: validRange ? currentDay : warmup,
              })
            }
          >
            Inspect network and policy
          </Button>
        </div>
        <p className="lab-help">
          {definition.definition}{" "}
          {fixture &&
            "Recorded snapshot contains one SKU and the original five stock/service series; run a lesson to unlock the full daily evidence."}
        </p>
        {!validRange && <p role="alert">Choose ordered whole days between 0 and {last}.</p>}
        {query.error && !fixture && (
          <p role="alert" aria-label="Daily evidence error">
            {query.error.message}{" "}
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry daily evidence
            </Button>
          </p>
        )}
      </section>
      {series && validRange && !query.error && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Observed days", String(summary.count)],
              ["Unavailable days", String(summary.missing)],
              ["Daily arithmetic mean", number(summary.mean, 2)],
              ["Minimum / maximum", `${number(summary.min, 2)} / ${number(summary.max, 2)}`],
            ].map(([label, value]) => (
              <div className="panel p-4" key={label}>
                <p className="eyebrow">{label}</p>
                <p className="mono mt-3 text-lg">{value}</p>
              </div>
            ))}
          </div>
          <StudyPlot
            title={`${definition.label} · ${kind}`}
            rows={rows}
            source={`${fixture ? "Recorded" : "API"} run ${network.network.run_id} · ${node}/${sku} · first replication · days ${start}–${end}. Warm-up before day ${network.warmup_days}. Missing values remain gaps; daily mean is not the aggregate KPI. ${kind === "distribution" ? "Up to 10 equal-width bins; CSV contains underlying daily observations." : kind === "scatter" ? "Same-day observations; association does not establish causality." : ""}`}
            option={{
              ...plot,
              tooltip: { trigger: kind === "scatter" ? "item" : "axis" },
              grid: { left: 80, right: 40, top: 45, bottom: 70 },
            }}
          />
          {!summary.count && (
            <p role="status" className="panel p-4">
              No defined values in this window. Check the metric definition, planning mode and
              facility.
            </p>
          )}
          <section className="panel p-5">
            <label className="field">
              Selected day <span className="mono">{currentDay}</span>
              <input
                className="min-w-0 flex-1"
                aria-label="Explorer selected day"
                type="range"
                min={start}
                max={end}
                value={currentDay}
                onChange={(e) => setCursor(Number(e.target.value))}
              />
            </label>
            <p className="mt-3 text-sm">
              {definition.label}:{" "}
              <strong className="mono">{number(series.metrics[metric]?.[current], 3)}</strong>{" "}
              {definition.unit} ·{" "}
              {currentDay < warmup ? "Warm-up — excluded from KPIs" : "Measured day"}
            </p>
          </section>
        </>
      )}
      {!series && !query.error && <p role="status">Loading daily observations…</p>}
    </div>
  );
}
