import { useState } from "react";
import katex from "katex";
import type { Study } from "../lib/labs";

const formulas = [
  ["Economic order quantity", "Q^*=\\sqrt{\\frac{2DS}{H}}"],
  ["Reorder point", "ROP=\\mu_d L+z\\sqrt{L\\sigma_d^2+\\mu_d^2\\sigma_L^2}"],
  ["Cycle service level", "CSL=\\Phi(z)"],
  ["Expected immediate fill", "FR=1-\\frac{\\sigma_{LT}G(z)}{Q}"],
  ["Pooled safety stock", "SS=z\\sqrt{L\\sum_{i,j}\\rho_{ij}\\sigma_i\\sigma_j}"],
  [
    "Weekly bullwhip",
    "BWE_k=\\frac{\\operatorname{Var}(O_{k,week})}{\\operatorname{Var}(D_{customer,week})}",
  ],
];
export default function Methodology({ data }: { data: Study }) {
  const [search, setSearch] = useState("");
  const rows = data.parameters.filter((row) =>
    `${row.parameter} ${row.value}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Daily-step operations study</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--secondary)]">
          Receive, consume, update forecasts, review replenishment, dispatch FIFO and accrue costs.
          NumPy vectorizes SKU/node dimensions while the engine loops over days. SeedSequence
          streams separate demand, transit and training; matched seeds support paired scenario
          differences. This synthetic FMCG study illustrates operating trade-offs and requires
          calibration before business decisions.
        </p>
        <div className="mt-4 flex flex-wrap gap-5 text-sm text-[var(--accent)]">
          <a href="/reference/validation">Download validation report (Markdown) ↓</a>
          <a href="/reference/parameters">Full parameter provenance ↓</a>
          <a href="/reference/assumptions">Model assumptions ↓</a>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        {formulas.map(([title, formula]) => (
          <section className="panel overflow-x-auto p-5" key={title}>
            <h2 className="mb-4 text-sm font-semibold">{title}</h2>
            <div
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(formula!, {
                  displayMode: true,
                  throwOnError: false,
                  trust: false,
                }),
              }}
            />
          </section>
        ))}
      </div>
      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Key assumptions and teaching controls</h2>
          <input
            aria-label="Find assumption"
            placeholder="Filter assumptions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-[var(--border)]" key={row.parameter}>
                  <td className="py-3 pr-4">{row.parameter}</td>
                  <td className="mono pr-4">{row.value}</td>
                  <td className="text-[var(--secondary)]">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel p-5">
        <h2 className="mb-4 text-sm font-semibold">Recorded verification and validation</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th>Check</th>
                <th>Outcome</th>
                <th>Recorded evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.validation.map((row) => (
                <tr key={row.parameter} className="border-t border-[var(--border)]">
                  <td className="py-3 pr-4">{row.parameter}</td>
                  <td className="pr-4">{row.value}</td>
                  <td className="break-all text-[var(--secondary)]">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-6 text-[var(--secondary)]">
          These checks describe their recorded source snapshots. Current local software checks are
          documented in the validation report. Research sweeps use reduced acceptance replications;
          ordinary t intervals can exceed physical rate bounds. Censored recovery and undefined
          ratios remain unavailable. The final case-study report is scheduled for M12.
        </p>
      </section>
    </div>
  );
}
