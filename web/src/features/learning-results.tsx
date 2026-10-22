import { StudyPlot } from "../components/study-plot";
import { differenceIndicator, type LearningResult } from "../lib/learning";
import { number } from "../lib/tower";

export default function LearningResults({
  result,
  goal,
}: {
  result: LearningResult;
  goal: number;
}) {
  const metrics = [
    ["fill_rate", "Immediate fill rate", 100, "% / pp"],
    ["cycle_service_level", "Achieved cycle service", 100, "% / pp"],
    ["total_landed_cost_inr", "Operating landed cost", 1, "INR"],
    ["days_of_inventory", "Days of inventory", 1, "days"],
    ["stockout_days", "Customer stockout days", 1, "days"],
    ["inventory_turns", "Annualised inventory turns", 1, "turns/year"],
    ["otif", "Same-day demand-line OTIF", 100, "% / pp"],
    ["bullwhip_ratio", "Weekly order amplification", 1, "ratio"],
    ["cash_to_cash_days", "Cash-to-cash", 1, "days"],
  ] as const;
  const service = result.b.metrics.fill_rate;
  const goalText =
    !Number.isFinite(goal) || goal < 0 || goal > 1
      ? "Choose a service goal between 0 and 1"
      : service?.mean == null
        ? "Service unavailable"
        : service.mean < goal
          ? "B mean below your service goal"
          : service.ci95 && service.ci95[0]! >= goal
            ? "B interval meets your service goal"
            : "B mean meets goal; uncertainty remains";
  const cost = result.comparison.costs;
  return (
    <div
      className="space-y-5"
      data-testid="learning-results"
      data-run-a={result.comparison.run_a}
      data-run-b={result.comparison.run_b}
    >
      <section className="workspace-callout">
        <div>
          <p className="eyebrow">EVIDENCE / {result.comparison.replications} PAIRED REPLICATIONS</p>
          <h2 className="mt-2 text-lg font-semibold">{goalText}</h2>
          <p className="lab-help">
            Goal: {number(goal * 100, 1)}% immediate fill. This is an editable learning criterion,
            not the CSL policy target or a validated business requirement. Intervals describe
            simulation uncertainty, not model error.
          </p>
        </div>
      </section>
      <section className="panel overflow-hidden">
        <div className="p-5">
          <h2 className="text-base font-semibold">Read the trade-offs</h2>
          <p className="lab-help">
            A/B are replicated means. Differences and their 95% t intervals are paired B−A. pp =
            percentage points. An interval crossing zero leaves the direction uncertain; one
            replication cannot establish uncertainty.
          </p>
        </div>
        <div className="overflow-auto">
          <table className="operations-table" aria-label="Learning experiment results">
            <thead>
              <tr>
                <th>Metric / unit</th>
                <th>A mean</th>
                <th>B mean</th>
                <th>Δ B−A</th>
                <th>Paired 95% interval</th>
                <th>Indicator</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([key, label, scale, unit]) => {
                const delta = result.comparison.metrics[key];
                return (
                  <tr key={key}>
                    <td>
                      {label}
                      <span className="block text-[10px] text-[var(--secondary)]">{unit}</span>
                    </td>
                    <td className="mono">
                      {number(
                        result.a.metrics[key]?.mean == null
                          ? null
                          : result.a.metrics[key]!.mean! * scale,
                        2,
                      )}
                    </td>
                    <td className="mono">
                      {number(
                        result.b.metrics[key]?.mean == null
                          ? null
                          : result.b.metrics[key]!.mean! * scale,
                        2,
                      )}
                    </td>
                    <td
                      className="mono"
                      data-testid={`learning-delta-${key}`}
                      data-value={delta?.mean ?? ""}
                    >
                      {number(delta?.mean == null ? null : delta.mean * scale, 2)}
                    </td>
                    <td className="mono">
                      {delta?.ci95
                        ? `${number(delta.ci95[0]! * scale, 2)} to ${number(delta.ci95[1]! * scale, 2)}`
                        : "Unavailable"}
                    </td>
                    <td>{differenceIndicator(delta ?? { mean: null })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <StudyPlot
        title="Explain the cost change"
        rows={[
          ["component", "A INR", "B INR", "delta INR", "95% low", "95% high"],
          ...cost.component.map((name, i) => [
            name,
            cost.a[i] ?? null,
            cost.b[i] ?? null,
            cost.delta[i] ?? null,
            cost.ci95_low[i] ?? null,
            cost.ci95_high[i] ?? null,
          ]),
        ]}
        source="Replicated operating ledger; eight components reconcile to total landed cost. Initial stock acquisition is excluded. Bar direction alone does not establish statistical confidence; intervals are in CSV."
        option={{
          xAxis: { type: "value", name: "Δ B−A · INR" },
          yAxis: { type: "category", data: cost.component, inverse: true },
          series: [{ type: "bar", data: cost.delta }],
          grid: { left: 125, right: 35, top: 30, bottom: 50 },
        }}
      />
      <section className="panel p-5 text-sm leading-7">
        <h3 className="font-semibold">Interpret before deciding</h3>
        <p>
          Check service and inventory together with cost. Confirm the effect with additional
          replications and an independent root seed. Investigate the first-replication SKU, facility
          and lane diagnostics; they identify contributors, not causal proof. Export the exact input
          snapshots before changing assumptions.
        </p>
      </section>
    </div>
  );
}
