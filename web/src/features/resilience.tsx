import { useState } from "react";
import { type Study, selectCases, estimate } from "../lib/labs";
import { number } from "../lib/tower";
import { StudyPlot } from "../components/study-plot";

export default function Resilience({ data }: { data: Study }) {
  const [eventId, setEvent] = useState("0");
  const [mitigation, setMitigation] = useState("none");
  const selected = data.resilience_series[eventId]!;
  const { event, series, metrics } = selected;
  const experiment = data.experiments.E6!;
  const base = selectCases(experiment.cases, {
    event: Number(eventId),
    mitigation,
    parameter: "none",
    scale: 1,
  })[0]!;
  const baseCost = estimate(experiment, base.case_id, "disruption_cost_inr")?.mean;
  const parameters = ["demand", "capacity", "lead", "holding"];
  const effects = [0.8, 1.2].map((scale) =>
    parameters.map((parameter) => {
      const row = selectCases(experiment.cases, {
        event: Number(eventId),
        mitigation,
        parameter,
        scale,
      })[0];
      const value = row ? estimate(experiment, row.case_id, "disruption_cost_inr")?.mean : null;
      return value == null || baseCost == null ? null : value - baseCost;
    }),
  );
  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <label className="field">
          Disruption
          <select
            aria-label="Resilience event"
            value={eventId}
            onChange={(e) => setEvent(e.target.value)}
          >
            {Object.entries(data.resilience_series).map(([id, row]) => (
              <option key={id} value={id}>
                {row.event.type.replaceAll("_", " ")} · {row.event.target}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--secondary)]">
          Representative M6 pair · seed {series.seed} · interval [{event.start_day},{" "}
          {event.start_day + event.duration})
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            "Time to survive",
            metrics.tts_days == null
              ? "No stockout observed"
              : `${number(metrics.tts_days, 2)} days`,
          ],
          [
            "Time to recover",
            metrics.ttr_days == null
              ? "Not recovered by horizon"
              : `${number(metrics.ttr_days, 1)} days`,
          ],
          ["Disruption cost · INR", number(metrics.disruption_cost_inr, 2)],
        ].map(([label, value]) => (
          <article className="panel p-5" key={label}>
            <p className="eyebrow">{label}</p>
            <p className="mono mt-3 text-xl">{value}</p>
          </article>
        ))}
      </div>
      <StudyPlot
        title="Affected-customer service through the disruption"
        source={`${series.source} · first paired replication, no mitigation. Rolling seven-day immediate fill; recovery is the first post-breach return within 1 percentage point of the paired baseline. Later relapses are possible.`}
        rows={[
          ["day", "baseline_rolling_fill", "event_rolling_fill"],
          ...series.days.map((day, i) => [
            day,
            series.columns.baseline_fill![i]!,
            series.columns.event_fill![i]!,
          ]),
        ]}
        option={{
          legend: {
            data: ["Undisturbed baseline", "Disrupted"],
            top: 0,
            textStyle: { color: "#71717a" },
          },
          xAxis: { type: "category", data: series.days },
          yAxis: { type: "value", name: "Fill fraction" },
          series: [
            {
              name: "Undisturbed baseline",
              type: "line",
              showSymbol: false,
              data: series.columns.baseline_fill!,
            },
            {
              name: "Disrupted",
              type: "line",
              showSymbol: false,
              data: series.columns.event_fill!,
              markArea: {
                silent: true,
                itemStyle: { color: "#a1a1aa", opacity: 0.15 },
                data: [
                  [
                    { name: event.type.replaceAll("_", " "), xAxis: event.start_day },
                    { xAxis: event.start_day + event.duration },
                  ],
                ],
              },
            },
          ],
        }}
      />
      <section className="panel flex items-center justify-between gap-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">E6 mitigation and sensitivity evidence</h2>
          <p className="mt-2 text-xs text-[var(--secondary)]">
            Separate two-run evaluation means. The representative timeline above retains its
            undisturbed/event pair.
          </p>
        </div>
        <label className="field">
          Mitigation
          <select
            aria-label="Sensitivity mitigation"
            value={mitigation}
            onChange={(e) => setMitigation(e.target.value)}
          >
            {[...new Set(experiment.cases.map((row) => String(row.factors.mitigation)))].map(
              (name) => (
                <option key={name} value={name}>
                  {name.replaceAll("_", " ")}
                </option>
              ),
            )}
          </select>
        </label>
      </section>
      <StudyPlot
        title="Disruption-cost sensitivity to operating parameters"
        source={`${experiment.source} · changes in mean disruption cost against the same mitigation with unchanged parameters. OAT ±20%; interactions and multiplicity are not estimated.`}
        rows={[
          ["parameter", "minus20_effect_INR", "plus20_effect_INR"],
          ...parameters.map((parameter, i) => [parameter, effects[0]![i]!, effects[1]![i]!]),
        ]}
        option={{
          legend: { data: ["−20%", "+20%"], top: 0, textStyle: { color: "#71717a" } },
          xAxis: { type: "value", name: "Δ INR" },
          yAxis: { type: "category", data: parameters },
          series: [
            { name: "−20%", type: "bar", data: effects[0]! },
            { name: "+20%", type: "bar", data: effects[1]! },
          ],
        }}
      />
    </div>
  );
}
