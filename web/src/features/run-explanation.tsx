import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { client, read } from "../lib/data";
import { csv, download, number } from "../lib/tower";
import { useTower } from "../lib/state";
import { Button } from "../components/ui/button";
import { StudyPlot } from "../components/study-plot";

function EvidenceTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="ghost" onClick={() => download(`${title}.csv`, csv([columns, ...rows]))}>
          Export CSV
        </Button>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="operations-table" aria-label={title}>
          <thead>
            <tr>
              {columns.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => (
                  <td className={j ? "mono" : "font-medium"} key={j}>
                    {typeof value === "number" ? number(value, 2) : (value ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export default function RunExplanation({ runId }: { runId: string }) {
  const { set } = useTower();
  const [exportError, setExportError] = useState("");
  const result = useQuery({
    queryKey: ["diagnostics", runId],
    queryFn: async () =>
      read(await client.GET("/runs/{run_id}/diagnostics", { params: { path: { run_id: runId } } })),
  });
  if (result.error)
    return (
      <p role="alert" className="panel p-5 text-sm">
        {result.error.message}
      </p>
    );
  if (!result.data) return <p role="status">Loading reconciled run diagnostics…</p>;
  const data = result.data;
  const skus = [...data.skus].sort((a, b) => b.shortage_units - a.shortage_units);
  const facilities = [...data.facilities].sort((a, b) => b.cost_inr - a.cost_inr);
  const lanes = [...data.lanes].sort((a, b) => b.freight_inr - a.freight_inr);
  return (
    <section className="space-y-4" aria-label="Run diagnostics">
      <div className="workspace-callout">
        <div>
          <p className="eyebrow">EXPLAIN THE OPERATING RESULT</p>
          <h2 className="mt-2 text-lg font-semibold">Where service and cost accumulate</h2>
          <p className="mt-2 text-xs leading-6 text-[var(--secondary)]">
            Representative seed {data.representative_seed} · {data.horizon_days} measured days after{" "}
            {data.warmup_days} warm-up days. These are observed contributors from one replication,
            not causal estimates or replicated confidence intervals.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            download("run-diagnostics.json", JSON.stringify(data, null, 2), "application/json")
          }
        >
          Download diagnostics
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const provenance = read(
                await client.GET("/runs/{run_id}/provenance", {
                  params: { path: { run_id: runId } },
                }),
              );
              download(
                "run-provenance.json",
                JSON.stringify(provenance, null, 2),
                "application/json",
              );
              setExportError("");
            } catch (error) {
              setExportError(error instanceof Error ? error.message : "Evidence export failed.");
            }
          }}
        >
          Download model provenance
        </Button>
      </div>
      {exportError && (
        <p role="alert" className="text-xs">
          {exportError}
        </p>
      )}
      <StudyPlot
        title="Largest SKU immediate-service shortfalls"
        height={300}
        source="New customer demand not filled immediately, summed across customers and measured days. Backorders are not counted repeatedly. Shared DC, ordering and freight costs are not arbitrarily assigned to SKUs."
        rows={[["SKU", "shortage_units"], ...skus.map((row) => [row.id, row.shortage_units])]}
        option={{
          grid: { left: 65, right: 25, top: 20, bottom: 35 },
          xAxis: { type: "value", name: "Units" },
          yAxis: {
            type: "category",
            data: skus
              .slice(0, 10)
              .reverse()
              .map((row) => row.id),
          },
          series: [
            {
              type: "bar",
              itemStyle: { color: "#C2410C" },
              data: skus
                .slice(0, 10)
                .reverse()
                .map((row) => row.shortage_units),
            },
          ],
        }}
      />
      <EvidenceTable
        title="SKU shortage contributors"
        columns={[
          "SKU",
          "Demand · units",
          "Immediate shortfall · units",
          "Mean inventory · INR",
          "Forecast WMAPE · %",
          "Forecast bias · %",
        ]}
        rows={skus.map((row) => [
          `${row.id} · ${row.label}`,
          row.demand_units,
          row.shortage_units,
          row.inventory_value_inr,
          row.forecast_wmape == null ? null : row.forecast_wmape * 100,
          row.forecast_bias == null ? null : row.forecast_bias * 100,
        ])}
      />
      <EvidenceTable
        title="Facility cost and capacity"
        columns={[
          "Facility",
          "Echelon",
          "Customer shortfall · units",
          "Mean inventory · INR",
          "Ledger cost · INR",
          "Dispatch utilization · %",
        ]}
        rows={facilities.map((row) => [
          `${row.id} · ${row.label}`,
          row.kind,
          row.shortage_units,
          row.inventory_value_inr,
          row.cost_inr,
          row.utilization == null ? null : row.utilization * 100,
        ])}
      />
      <div className="flex flex-wrap gap-2">
        {facilities
          .filter((row) => row.shortage_units > 0)
          .slice(0, 6)
          .map((row) => (
            <Button
              key={row.id}
              variant="outline"
              onClick={() => set({ mode: "live", run: runId, node: row.id, view: "tower" })}
            >
              Investigate {row.id} ↗
            </Button>
          ))}
      </div>
      <EvidenceTable
        title="Lane freight contributors"
        columns={[
          "Lane",
          "Source",
          "Destination",
          "Dispatched · units",
          "Freight + expedite · INR",
          "Closing transit · units",
        ]}
        rows={lanes.map((row) => [
          row.id,
          row.source,
          row.target,
          row.shipped_units,
          row.freight_inr,
          row.closing_in_transit_units,
        ])}
      />
      <p className="break-all text-[10px] leading-6 text-[var(--secondary)]">
        Run {runId}. Inventory values are measured-horizon means at base SKU cost. Facility costs
        reconcile to all eight ledger accounts; lane costs reconcile to inbound/outbound freight
        including expedite premiums. Utilization is dispatch divided by available capacity after
        event cuts, and does not itself prove a bottleneck. Forecast bias is signed (forecast −
        demand) / demand; positive means overforecast. No further upstream purchasing or within-day
        warehouse scheduling is modeled.
      </p>
    </section>
  );
}
