import { useState } from "react";
import { ArrowRight, Box, Clock3, Network, Search, SlidersHorizontal } from "lucide-react";
import catalog from "../fixtures/workspace.json";
import { useTower } from "../lib/state";
import { Button } from "../components/ui/button";

export default function Playbooks() {
  const { set } = useTower();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All scenarios");
  const rows = catalog.playbooks.filter(
    (row) =>
      (category === "All scenarios" || row.category === category) &&
      `${row.title} ${row.summary}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <section className="workspace-hero">
        <div className="max-w-2xl">
          <p className="eyebrow text-[var(--accent)]">THE OPERATIONS SIMULATION LIBRARY</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Real operating questions.
            <br />
            Reproducible scenarios.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--secondary)]">
            Explore sourcing, inventory, distribution and demand trade-offs without an ERP feed.
            Start with an explicit synthetic playbook, adjust the assumptions, then compare paired
            simulation results.
          </p>
        </div>
        <div className="grid min-w-48 grid-cols-2 gap-3 self-center">
          <div className="hero-stat">
            <span className="mono text-3xl">{catalog.playbooks.length}</span>
            <span>Operating playbooks</span>
          </div>
          <div className="hero-stat">
            <Network size={28} />
            <span>One connected network</span>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search size={16} />
          <input
            className="w-full max-w-sm"
            aria-label="Search playbooks"
            placeholder="Search demand, sourcing, inventory…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          aria-label="Playbook category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {["All scenarios", ...new Set(catalog.playbooks.map((row) => row.category))].map(
            (name) => (
              <option key={name}>{name}</option>
            ),
          )}
        </select>
        <span className="mono text-xs text-[var(--secondary)]">{rows.length} playbooks</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {rows.map((row) => {
          const events = row.request.overrides.disruptions;
          return (
            <article key={row.id} className="playbook-card">
              <div className="flex items-center justify-between">
                <span className="module-tag">
                  <Box size={12} />
                  {row.category}
                </span>
                <span className="mono text-[10px] text-[var(--secondary)]">
                  {events.length
                    ? `${events.length} event${events.length > 1 ? "s" : ""}`
                    : "Network comparison"}
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-tight">{row.title}</h2>
              <p className="mt-2 text-xs leading-6 text-[var(--secondary)]">{row.summary}</p>
              <div className="event-strip">
                <span>Warm-up</span>
                <div />
                <span className="event-window">
                  {events.length
                    ? `Event · days ${events[0]!.start_day}–${events[0]!.start_day + events[0]!.duration - 1}`
                    : "Compare DC configurations"}
                </span>
                <div />
                <span>
                  Day {row.request.overrides.warmup_days + row.request.overrides.horizon_days - 1}
                </span>
              </div>
              <p className="min-h-12 text-sm leading-6">{row.question}</p>
              <p className="mt-3 text-[11px] leading-6 text-[var(--secondary)]">{row.assumption}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {row.watch.map((metric) => (
                  <span
                    className="rounded border border-[var(--border)] px-2 py-1 text-[10px]"
                    key={metric}
                  >
                    {metric}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <span className="flex items-center gap-2 text-[10px] text-[var(--secondary)]">
                  <Clock3 size={12} /> {row.request.replications} paired runs · editable inputs
                </span>
                <Button
                  aria-label={`Configure ${row.title}`}
                  onClick={() => set({ playbook: row.id, mode: "live", view: "scenario" })}
                >
                  <SlidersHorizontal />
                  Configure scenario <ArrowRight />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {!rows.length && (
        <div className="panel p-10 text-center text-sm">No playbooks match this search.</div>
      )}
      <div className="panel p-5 text-xs leading-6 text-[var(--secondary)]">
        All inputs are synthetic assumptions. Playbooks configure actual simulation requests; they
        do not contain invented outcomes. Standard runs use known-demand policies and backorders.
        Open Bullwhip Lab for forecast/order amplification, or Resilience for recorded mitigation
        and recovery evidence.
      </div>
    </div>
  );
}
