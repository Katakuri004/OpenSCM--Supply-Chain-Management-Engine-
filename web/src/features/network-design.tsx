import { useState } from "react";
import { type Study, selectCases, estimate, costComponents, colors } from "../lib/labs";
import { StudyPlot } from "../components/study-plot";
import { Placement } from "../components/placement";

export default function NetworkDesign({ data }: { data: Study }) {
  const defaults = data.defaults;
  const experiment = data.experiments.E3!;
  const [cv, setCv] = useState(defaults.default_demand_cv);
  const [rho, setRho] = useState(defaults.default_rho);
  const [freight, setFreight] = useState(defaults.default_outbound_factor);
  const [lead, setLead] = useState(defaults.default_inbound_days);
  const [count, setCount] = useState("4");
  const [geo, setGeo] = useState(false);
  const cases = selectCases(experiment.cases, {
    demand_cv: cv,
    rho,
    outbound_factor: freight,
    inbound_days: lead,
  }).sort((a, b) => Number(a.factors.dc_count) - Number(b.factors.dc_count));
  const value = (id: string, metric: string) =>
    estimate(experiment, id, metric, "screen")?.mean ?? null;
  const heat = [0.5, 1, 2].flatMap((factor, y) =>
    [0, 0.3, 0.6, 0.9].map((correlation, x) => {
      const candidates = selectCases(experiment.cases, {
        demand_cv: cv,
        rho: correlation,
        outbound_factor: factor,
        inbound_days: lead,
      })
        .map((row) => ({
          count: Number(row.factors.dc_count),
          cost: value(row.case_id, "landed_cost_inr"),
        }))
        .filter((row) => row.cost !== null)
        .sort((a, b) => a.cost! - b.cost! || a.count - b.count);
      return {
        value: [x, y, candidates[0]!.count, candidates[0]!.cost!],
        label: { color: candidates[0]!.count >= 4 ? "#fff" : "#27272a" },
      };
    }),
  );
  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-center gap-5 p-4">
        {[
          ["Demand CV", cv, setCv, [0.2, 0.4, 0.8]],
          ["Regional correlation", rho, setRho, [0, 0.3, 0.6, 0.9]],
          ["Outbound freight factor", freight, setFreight, [0.5, 1, 2]],
          ["Inbound days", lead, setLead, [3, 7, 14]],
        ].map(([label, value, update, choices]) => (
          <label className="field" key={String(label)}>
            {String(label)}
            <select
              aria-label={String(label)}
              value={Number(value)}
              onChange={(event) => (update as (value: number) => void)(Number(event.target.value))}
            >
              {(choices as number[]).map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          </label>
        ))}
        <p className="text-xs text-[var(--secondary)]">
          E3 screening slice · 2 replications/cell · confirmation remains separate
        </p>
      </section>
      <StudyPlot
        title="Landed cost across DC counts"
        height={380}
        source={`${experiment.source} · screening means; purchases included. Small samples do not establish a preferred DC count.`}
        rows={[
          ["dc_count", ...costComponents.map((name) => `${name}_INR`), "total_INR"],
          ...cases.map((row) => [
            Number(row.factors.dc_count),
            ...costComponents.map((name) => value(row.case_id, `cost_${name}_inr`)),
            value(row.case_id, "landed_cost_inr"),
          ]),
        ]}
        option={{
          legend: { top: 0, textStyle: { color: "#71717a", fontSize: 10 } },
          xAxis: { type: "category", data: cases.map((row) => `${row.factors.dc_count} DCs`) },
          yAxis: { type: "value", name: "INR" },
          series: [
            ...costComponents.map((name, i) => ({
              name: name.replaceAll("_", " "),
              type: "bar" as const,
              stack: "cost",
              itemStyle: { color: colors[i]! },
              data: cases.map((row) => value(row.case_id, `cost_${name}_inr`)),
            })),
            {
              name: "Total",
              type: "line",
              data: cases.map((row) => value(row.case_id, "landed_cost_inr")),
              lineStyle: { color: "#2B5C8A", width: 2 },
            },
          ],
        }}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <StudyPlot
          title="Screening break-even map"
          source="Cells label the lowest mean-cost DC count for the selected CV and inbound lead. Ties select the smaller count. This is a screening outcome, not a significance test."
          rows={[
            ["rho", "outbound_factor", "dc_count", "cost_INR"],
            ...heat.map((cell) => [
              [0, 0.3, 0.6, 0.9][cell.value[0]!]!,
              [0.5, 1, 2][cell.value[1]!]!,
              cell.value[2]!,
              cell.value[3]!,
            ]),
          ]}
          option={{
            tooltip: { trigger: "item" },
            grid: { left: 70, right: 25, top: 25, bottom: 80 },
            xAxis: { type: "category", name: "ρ", data: ["0", "0.3", "0.6", "0.9"] },
            yAxis: { type: "category", name: "Freight ×", data: ["0.5", "1", "2"] },
            visualMap: {
              min: 1,
              max: 8,
              dimension: 2,
              orient: "horizontal",
              left: "center",
              bottom: 0,
              inRange: { color: ["#e2eaf2", "#2B5C8A"] },
              text: ["8 DCs", "1 DC"],
            },
            series: [
              {
                type: "heatmap",
                data: heat,
                label: {
                  show: true,
                  formatter: (params) => `${(params.value as number[])[2]} DCs`,
                },
              },
            ],
          }}
        />
        <section className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">DC placement and assigned lanes</h2>
            <label className="field">
              Open DCs
              <select
                aria-label="Placement DC count"
                value={count}
                onChange={(event) => setCount(event.target.value)}
              >
                {[1, 2, 4, 8].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <input
                type="checkbox"
                checked={geo}
                onChange={(event) => setGeo(event.target.checked)}
              />
              Latitude/longitude
            </label>
          </div>
          <Placement network={data.networks[count]!} geographic={geo} />
          <p className="text-[10px] text-[var(--secondary)]">
            Demand-weighted k-median assignments from configs/network.yaml. Geographic positions use
            coordinates; lane widths do not represent simulated flow.
          </p>
        </section>
      </div>
    </div>
  );
}
