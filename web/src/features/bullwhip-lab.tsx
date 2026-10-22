import { useState } from "react";
import { type Study, selectCases, estimate } from "../lib/labs";
import { number } from "../lib/tower";
import { StudyPlot } from "../components/study-plot";

export default function BullwhipLab({ data }: { data: Study }) {
  const [flags, setFlags] = useState({
    signal_processing: false,
    batching: false,
    price: false,
    rationing: false,
    pos_sharing: false,
  });
  const [lead, setLead] = useState(1);
  const experiment = data.experiments.E4!;
  const selected = selectCases(experiment.cases, { ...flags, lead_factor: lead })[0]!;
  const trace = data.bullwhip_series[selected.case_id]!;
  const names = ["customer_demand", "customer_orders", "dc_orders", "supplier_orders_received"];
  const labels = [
    "Customer demand",
    "Retailer + buyer orders",
    "DC orders",
    "Supplier orders received",
  ];
  const metrics = names.map((name) => estimate(experiment, selected.case_id, `bwe_${name}`)!);
  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap gap-5 p-5">
        {Object.entries(flags).map(([key, value]) => (
          <label key={key} className="field">
            <input
              type="checkbox"
              checked={value}
              onChange={(event) =>
                setFlags((previous) => ({ ...previous, [key]: event.target.checked }))
              }
            />
            {key.replaceAll("_", " ")}
          </label>
        ))}
        <label className="field">
          Lead factor
          <select
            aria-label="Bullwhip lead factor"
            value={lead}
            onChange={(event) => setLead(Number(event.target.value))}
          >
            <option value={1}>Original lead</option>
            <option value={0.5}>Half lead</option>
          </select>
        </label>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <StudyPlot
          title="Weekly bullwhip by echelon"
          source={`${experiment.source} · ${selected.case_id} · ${metrics[0]!.n} evaluation runs; reference 1 is the known-demand variance benchmark.`}
          rows={[
            ["echelon", "BWE", "CI_low", "CI_high", "n"],
            ...metrics.map((row, i) => [labels[i]!, row.mean, row.low, row.high, row.n]),
          ]}
          option={{
            grid: { left: 70, right: 25, top: 25, bottom: 75 },
            xAxis: { type: "category", data: ["Demand", "Retail/B2B", "DCs", "Suppliers"] },
            yAxis: { type: "value", name: "Variance ratio" },
            series: [
              {
                type: "bar",
                data: metrics.map((row) => row.mean),
                itemStyle: { color: "#2B5C8A" },
                markLine: {
                  silent: true,
                  symbol: "none",
                  data: [
                    {
                      yAxis: 1,
                      name: "Known-demand reference",
                      label: { formatter: "BWE = 1", position: "insideEndTop" },
                    },
                  ],
                },
              },
            ],
          }}
        />
        <section className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold">Estimates and uncertainty</h2>
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th>Echelon</th>
                <th>Mean</th>
                <th>95% t interval</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((row, i) => (
                <tr className="border-t border-[var(--border)]" key={row.metric}>
                  <td className="py-3">{labels[i]}</td>
                  <td className="mono">{number(row.mean, 3)}</td>
                  <td className="mono">
                    {number(row.low, 3)} – {number(row.high, 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs leading-6 text-[var(--secondary)]">
            Unbounded intervals may extend below zero. Suppliers receive DC orders because this
            model has no further upstream purchasing stage. Two evaluation runs do not establish a
            general mitigation effect.
          </p>
        </section>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {names.slice(1).map((name, i) => (
          <StudyPlot
            key={name}
            title={`${labels[i + 1]} vs demand`}
            height={240}
            group="weekly-orders"
            source={`${trace.source} · seed ${trace.seed}; first representative trajectory, not an average stock path.`}
            rows={[
              ["week_end_day", "customer_demand_units", `${name}_units`],
              ...trace.days.map((day, j) => [
                day,
                trace.columns.customer_demand![j]!,
                trace.columns[name]![j]!,
              ]),
            ]}
            option={{
              grid: { left: 55, right: 10, top: 30, bottom: 35 },
              legend: { data: ["Demand", "Orders"], top: 0, textStyle: { color: "#71717a" } },
              xAxis: { type: "category", data: trace.days, axisLabel: { fontSize: 9 } },
              yAxis: { type: "value", axisLabel: { fontSize: 9 } },
              series: [
                {
                  name: "Demand",
                  type: "line",
                  showSymbol: false,
                  data: trace.columns.customer_demand!,
                },
                { name: "Orders", type: "line", showSymbol: false, data: trace.columns[name]! },
              ],
            }}
          />
        ))}
      </div>
      <StudyPlot
        title="Daily moving-average theory check"
        source={`${data.theory.source} · daily single-echelon benchmark L=5, separate from the weekly network above. Bound = 1 + 2L/p + 2L²/p².`}
        rows={[
          ["MA_window_days", "Chen_bound", "observed_BWE", "known_demand_control"],
          ...data.theory.days.map((day, i) => [
            day,
            data.theory.columns.bound![i]!,
            data.theory.columns.observed_ratio![i]!,
            data.theory.columns.control_ratio![i]!,
          ]),
        ]}
        option={{
          legend: {
            data: ["Observed", "Chen benchmark", "Control"],
            top: 0,
            textStyle: { color: "#71717a" },
          },
          xAxis: { type: "category", name: "p days", data: data.theory.days },
          yAxis: { type: "value", name: "Daily BWE" },
          series: [
            { name: "Observed", type: "line", data: data.theory.columns.observed_ratio! },
            {
              name: "Chen benchmark",
              type: "line",
              data: data.theory.columns.bound!,
              lineStyle: { type: "dashed" },
            },
            { name: "Control", type: "line", data: data.theory.columns.control_ratio! },
          ],
        }}
      />
    </div>
  );
}
