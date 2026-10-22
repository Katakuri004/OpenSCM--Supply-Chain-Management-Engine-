import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTower } from "../lib/state";
import { client, read } from "../lib/data";
import { type Study, costComponents, colors } from "../lib/labs";
import { number, type Schema } from "../lib/tower";
import { Button } from "../components/ui/button";
import { StudyPlot } from "../components/study-plot";
import { Placement } from "../components/placement";

type DcCount = 1 | 2 | 4 | 8;
export default function ScenarioLab({ data }: { data: Study }) {
  const { mode, set } = useTower();
  const defaults = data.defaults;
  const [aCount, setA] = useState<DcCount>(defaults.baseline_dcs);
  const [bCount, setB] = useState<DcCount>(defaults.alternative_dcs);
  const [values, setValues] = useState(defaults.events.map((event) => event.neutral));
  const [ids, setIds] = useState<[string, string] | null>(null);
  const live = mode === "live";
  const target = (control: (typeof defaults.events)[number]) => {
    const nodes = data.networks[String(bCount)]!.nodes;
    return control.type === "capacity_cut" && !nodes.id.includes(control.target)
      ? nodes.id.find((_, i) => nodes.type[i] === "dc")!
      : control.target;
  };
  const create = useMutation({
    mutationFn: async () => {
      setIds(null);
      const disruptions: Schema["Disruption"][] = defaults.events.flatMap((control, i) =>
        values[i] === control.neutral
          ? []
          : [
              {
                type: control.type as Schema["Disruption"]["type"],
                target: target(control),
                magnitude: values[i]!,
                start_day: defaults.event_start,
                duration: defaults.event_duration,
              },
            ],
      );
      const results = await Promise.all(
        [aCount, bCount].map(async (count, i) =>
          read(
            await client.POST("/runs", {
              body: {
                seed: defaults.seed,
                replications: defaults.replications,
                overrides: {
                  network: { dc_count: count },
                  warmup_days: defaults.warmup_days,
                  horizon_days: defaults.horizon_days,
                  disruptions: i === 1 ? disruptions : [],
                },
              },
            }),
          ),
        ),
      );
      return [results[0]!.run_id, results[1]!.run_id] as [string, string];
    },
    onSuccess: setIds,
  });
  const statuses = useQuery({
    queryKey: ["pair-status", ids],
    queryFn: async () =>
      Promise.all(
        ids!.map(async (id) =>
          read(await client.GET("/runs/{run_id}", { params: { path: { run_id: id } } })),
        ),
      ),
    enabled: live && !!ids,
    refetchInterval: (query) =>
      query.state.data?.every(
        (status) => status.status === "complete" || status.status === "failed",
      )
        ? false
        : 500,
  });
  const completed = useQuery({
    queryKey: ["pair-results", ids],
    queryFn: async (): Promise<Schema["StudyPair"]> => {
      const [networkA, networkB, comparison] = await Promise.all([
        client.GET("/runs/{run_id}/network", { params: { path: { run_id: ids![0] } } }),
        client.GET("/runs/{run_id}/network", { params: { path: { run_id: ids![1] } } }),
        client.GET("/compare", { params: { query: { a: ids![0], b: ids![1] } } }),
      ]);
      return {
        a: statuses.data![0]!,
        b: statuses.data![1]!,
        network_a: read(networkA),
        network_b: read(networkB),
        comparison: read(comparison),
      };
    },
    enabled: live && statuses.data?.every((status) => status.status === "complete") === true,
  });
  const pair = live ? completed.data : data.pair;
  const busy =
    create.isPending ||
    (ids !== null &&
      !statuses.error &&
      !completed.error &&
      !statuses.data?.some((row) => row.status === "failed") &&
      !completed.data);
  const failure = create.error ?? statuses.error ?? completed.error;
  const c = pair?.comparison;
  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">Paired network scenarios</h2>
          <div className="flex items-center gap-3">
            {[
              ["Scenario A DCs", aCount, setA],
              ["Scenario B DCs", bCount, setB],
            ].map(([label, count, update]) => (
              <label key={String(label)} className="field">
                {String(label)}
                <select
                  aria-label={String(label)}
                  disabled={!live || busy}
                  value={Number(count)}
                  onChange={(event) =>
                    (update as (value: DcCount) => void)(Number(event.target.value) as DcCount)
                  }
                >
                  {[1, 2, 4, 8].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
            <Button
              disabled={live && busy}
              onClick={() => (live ? create.mutate() : set({ mode: "live" }))}
              aria-label={live ? "Run paired scenarios" : "Use Live API"}
            >
              {live
                ? busy
                  ? "Running paired replications…"
                  : "Run paired scenarios"
                : "Use Live API"}
            </Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {defaults.events.map((control, i) => (
            <label className="rounded-md border border-[var(--border)] p-3" key={control.type}>
              <span className="mb-2 flex justify-between text-xs">
                <span>{control.type.replaceAll("_", " ")}</span>
                <span className="mono">{values[i]!.toFixed(2)}</span>
              </span>
              <input
                aria-label={control.type.replaceAll("_", " ")}
                type="range"
                className="w-full"
                disabled={!live || busy}
                min={control.minimum}
                max={control.maximum}
                step={control.step}
                value={values[i]}
                onChange={(event) =>
                  setValues((previous) =>
                    previous.map((value, j) => (j === i ? Number(event.target.value) : value)),
                  )
                }
              />
              <span className="text-[10px] text-[var(--secondary)]">
                B target {target(control)} · days {defaults.event_start}–
                {defaults.event_start + defaults.event_duration - 1}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs text-[var(--secondary)]">
          A is undisturbed; sliders apply to B. Shared root seed {defaults.seed},{" "}
          {defaults.replications} paired runs, {defaults.warmup_days} warm-up +{" "}
          {defaults.horizon_days} measured days.{" "}
          {live
            ? "Submit changed controls to recompute."
            : "Recorded pair: 1 DC versus 4 DCs. Use Live API to change factors."}
        </p>
        {failure && (
          <p role="alert" className="mt-3">
            {failure.message}
          </p>
        )}
        {statuses.data?.some((row) => row.status === "failed") && (
          <p role="alert">A scenario failed. Submit again to retry.</p>
        )}
      </section>
      <div
        data-testid="scenario-pair"
        data-ready={!!pair}
        data-run-a={pair?.a.run_id}
        data-run-b={pair?.b.run_id}
        className="space-y-5"
      >
        {pair && c ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["Customer fill Δ B−A", "paired-fill-delta", c.metrics.fill_rate?.mean, true],
                [
                  "Landed cost Δ B−A · INR",
                  "paired-cost-delta",
                  c.metrics.total_landed_cost_inr?.mean,
                  false,
                ],
                [
                  "Days of inventory Δ B−A",
                  "paired-dio-delta",
                  c.metrics.days_of_inventory?.mean,
                  false,
                ],
              ].map(([label, id, value, percentage]) => (
                <article key={String(id)} className="panel p-4">
                  <p className="eyebrow">{String(label)}</p>
                  <p
                    className="mono mt-3 text-xl"
                    data-testid={String(id)}
                    data-value={value == null ? "" : String(value)}
                  >
                    {value == null
                      ? "—"
                      : percentage
                        ? `${(Number(value) * 100).toFixed(4)} pp`
                        : number(Number(value), 2)}
                  </p>
                </article>
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {[
                ["A", pair.network_a],
                ["B", pair.network_b],
              ].map(([label, network]) => {
                const n = network as Schema["RunNetwork"];
                return (
                  <section className="panel p-4" key={String(label)}>
                    <h2 className="text-sm font-semibold">
                      Scenario {String(label)} ·{" "}
                      {n.network.nodes.type.filter((type) => type === "dc").length} DCs
                    </h2>
                    <p className="mt-1 text-xs text-[var(--secondary)]">
                      Fill{" "}
                      {n.kpis.metrics.fill_rate?.mean == null
                        ? "—"
                        : `${number(n.kpis.metrics.fill_rate.mean * 100, 2)}%`}{" "}
                      · cost INR {number(n.kpis.metrics.total_landed_cost_inr?.mean, 0)}
                    </p>
                    <Placement network={n.network} />
                  </section>
                );
              })}
            </div>
            <StudyPlot
              title="Measured landed cost by component"
              source={`${c.replications} matched seeds · eight API cost accounts · Δ = B−A; intervals remain in the API response.`}
              rows={[
                ["component", "A_INR", "B_INR", "delta_INR", "delta_CI_low", "delta_CI_high"],
                ...c.costs.component.map((name, i) => [
                  name,
                  c.costs.a[i]!,
                  c.costs.b[i]!,
                  c.costs.delta[i]!,
                  c.costs.ci95_low[i]!,
                  c.costs.ci95_high[i]!,
                ]),
              ]}
              option={{
                legend: {
                  data: costComponents.map((name) => name.replaceAll("_", " ")),
                  top: 8,
                  textStyle: { color: "#71717a", fontSize: 10 },
                },
                xAxis: { type: "category", data: ["Scenario A", "Scenario B"] },
                yAxis: { type: "value", name: "INR" },
                series: costComponents.map((name, i) => ({
                  name: name.replaceAll("_", " "),
                  type: "bar",
                  stack: "cost",
                  itemStyle: { color: colors[i]! },
                  data: [c.costs.a[i]!, c.costs.b[i]!],
                })),
              }}
            />
          </>
        ) : (
          <div className="panel p-8 text-sm" role="status">
            {busy
              ? "Waiting for both scenario replications and their paired comparison…"
              : "Run the paired scenarios to inspect network and cost differences."}
          </div>
        )}
      </div>
    </div>
  );
}
