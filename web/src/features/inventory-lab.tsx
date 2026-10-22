import { useState } from "react";
import {
  annualInventoryCost,
  economicQuantity,
  estimate,
  selectCases,
  type Study,
} from "../lib/labs";
import { number } from "../lib/tower";
import { StudyPlot } from "../components/study-plot";

export default function InventoryLab({ data }: { data: Study }) {
  const example = data.inventory;
  const [multiple, setMultiple] = useState(1);
  const [sku, setSku] = useState("SKU01");
  const q = economicQuantity(example.annual_demand, example.order_cost, example.holding_cost);
  const selected = q * multiple;
  const quantities = Array.from(
    {
      length:
        Math.round(
          (data.defaults.quantity_range[1]! - data.defaults.quantity_range[0]!) /
            data.defaults.quantity_step,
        ) + 1,
    },
    (_, i) => q * (data.defaults.quantity_range[0]! + i * data.defaults.quantity_step),
  );
  const curve = quantities.map((value) => [
    value,
    (example.annual_demand * example.order_cost) / value,
    (example.holding_cost * value) / 2,
    annualInventoryCost(value, example.annual_demand, example.order_cost, example.holding_cost),
  ]);
  const experiment = data.experiments.E2!;
  const cases = selectCases(experiment.cases, { sku }).sort(
    (a, b) =>
      estimate(experiment, a.case_id, "inventory_cost_inr")!.mean! -
      estimate(experiment, b.case_id, "inventory_cost_inr")!.mean!,
  );
  const cost = cases.map((row) => estimate(experiment, row.case_id, "inventory_cost_inr")!);
  const fill = cases.map((row) => estimate(experiment, row.case_id, "fill_rate")!);
  const csl = cases.map((row) => estimate(experiment, row.case_id, "achieved_csl")!);
  const trace = example.series;
  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-center gap-6 p-5">
        <label className="flex min-w-72 flex-1 items-center gap-4 text-xs">
          Analytical order quantity
          <input
            aria-label="Analytical order quantity"
            className="flex-1"
            type="range"
            min={data.defaults.quantity_range[0]}
            max={data.defaults.quantity_range[1]}
            step={data.defaults.quantity_step}
            value={multiple}
            onChange={(event) => setMultiple(Number(event.target.value))}
          />
        </label>
        <span className="mono text-sm">
          Q {number(selected, 1)} · Q* {number(q, 1)} · cost INR{" "}
          {number(
            annualInventoryCost(
              selected,
              example.annual_demand,
              example.order_cost,
              example.holding_cost,
            ),
            2,
          )}
          /year
        </span>
        <p className="w-full text-xs text-[var(--secondary)]">
          M2 benchmark: D={example.annual_demand} units/year, S=INR {example.order_cost}/order,
          H=INR {example.holding_cost}/unit/year. Slider changes the analytical curve; the recorded
          inventory trace retains Q*.
        </p>
      </section>
      <StudyPlot
        title="EOQ ordering and cycle-stock holding cost"
        source="configs/m2_validation.yaml · analytical M1 formula; purchase and shortage costs excluded."
        rows={[
          ["quantity_units", "ordering_INR_year", "holding_INR_year", "total_INR_year"],
          ...curve.map((row) => row.map((value) => value!)),
        ]}
        option={{
          legend: {
            data: ["Ordering", "Holding", "Total"],
            top: 0,
            textStyle: { color: "#71717a" },
          },
          xAxis: { type: "value", name: "Units/order" },
          yAxis: { type: "value", name: "INR/year" },
          series: ["Ordering", "Holding", "Total"].map((name, i) => ({
            name,
            type: "line",
            showSymbol: false,
            data: curve.map((row) => [row[0]!, row[i + 1]!]),
            markPoint:
              i === 2
                ? {
                    data: [
                      {
                        coord: [
                          q,
                          annualInventoryCost(
                            q,
                            example.annual_demand,
                            example.order_cost,
                            example.holding_cost,
                          ),
                        ],
                        name: "Q*",
                        value: "Q*",
                      },
                    ],
                  }
                : {},
            markLine:
              i === 2
                ? {
                    silent: true,
                    symbol: "none",
                    data: [{ xAxis: selected, label: { formatter: "Selected Q" } }],
                  }
                : {},
          })),
        }}
      />
      <StudyPlot
        title="Inventory sawtooth and simulated on-hand"
        source={`${trace.source} · seed ${trace.seed} · Q=${example.quantity}. Ideal zero-lead sawtooth starts a new cycle at display day zero; it is a teaching reference, not a fitted inventory forecast.`}
        rows={[
          ["measured_display_day", "simulated_on_hand", "ideal_sawtooth"],
          ...trace.days.map((day, i) => [
            day,
            trace.columns.on_hand![i]!,
            trace.columns.ideal_sawtooth![i]!,
          ]),
        ]}
        option={{
          legend: {
            data: ["Simulated on hand", "Ideal sawtooth"],
            top: 0,
            textStyle: { color: "#71717a" },
          },
          xAxis: { type: "category", data: trace.days, name: "Day" },
          yAxis: { type: "value", name: "Units" },
          series: [
            {
              name: "Simulated on hand",
              type: "line",
              showSymbol: false,
              data: trace.columns.on_hand!,
            },
            {
              name: "Ideal sawtooth",
              type: "line",
              showSymbol: false,
              lineStyle: { type: "dashed" },
              data: trace.columns.ideal_sawtooth!,
            },
          ],
        }}
      />
      <section className="panel p-4">
        <label className="field">
          E2 representative SKU
          <select
            aria-label="Service curve SKU"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
          >
            {[...new Set(experiment.cases.map((row) => String(row.factors.sku)))].map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
      </section>
      <StudyPlot
        title="Achieved service versus inventory cost"
        source={`${experiment.source} · ${sku} · 2 runs/target. Band is the unbounded 95% t interval for fill rate. CSL and fill rate measure different service events.`}
        rows={[
          [
            "target_CSL",
            "inventory_cost_INR",
            "fill_rate",
            "achieved_CSL",
            "fill_CI_low",
            "fill_CI_high",
          ],
          ...cases.map((row, i) => [
            Number(row.factors.target_csl),
            cost[i]!.mean,
            fill[i]!.mean,
            csl[i]!.mean,
            fill[i]!.low,
            fill[i]!.high,
          ]),
        ]}
        option={{
          legend: { data: ["Fill rate", "Achieved CSL"], top: 0, textStyle: { color: "#71717a" } },
          xAxis: {
            type: "category",
            name: "Mean inventory cost INR",
            nameLocation: "middle",
            nameGap: 30,
            data: cost.map((row) => number(row.mean, 0)),
          },
          yAxis: { type: "value", name: "Service fraction" },
          series: [
            {
              name: "CI base",
              type: "line",
              stack: "ci",
              stackStrategy: "all",
              showSymbol: false,
              lineStyle: { opacity: 0 },
              itemStyle: { opacity: 0 },
              data: fill.map((row) => row.low),
            },
            {
              name: "95% fill interval",
              type: "line",
              stack: "ci",
              stackStrategy: "all",
              showSymbol: false,
              lineStyle: { opacity: 0 },
              areaStyle: { color: "#2B5C8A", opacity: 0.12 },
              data: fill.map((row) =>
                row.low == null || row.high == null ? null : row.high - row.low,
              ),
            },
            {
              name: "Fill rate",
              type: "line",
              itemStyle: { color: "#2B5C8A" },
              data: fill.map((row) => row.mean),
            },
            {
              name: "Achieved CSL",
              type: "line",
              itemStyle: { color: "#71717a" },
              data: csl.map((row) => row.mean),
            },
          ],
        }}
      />
    </div>
  );
}
