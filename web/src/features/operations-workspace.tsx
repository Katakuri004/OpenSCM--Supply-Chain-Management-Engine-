import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  Download,
  Factory,
  Network,
  Package,
  ShieldCheck,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { StudyPlot } from "../components/study-plot";
import { useTower } from "../lib/state";
import {
  operationalSnapshot,
  readReviews,
  reviewKey,
  stateLabels,
  type SiteState,
} from "../lib/operations";
import { csv, download, number, type Schema } from "../lib/tower";
import catalog from "../fixtures/workspace.json";

const reviewStorage = "openscm:exception-reviews:v1";
const classFor = (state: SiteState) =>
  state === "stockout"
    ? "site-stockout"
    : state === "low_cover"
      ? "site-low"
      : state === "unknown"
        ? "site-unknown"
        : "site-covered";

export default function OperationsWorkspace({
  network,
  health,
  view,
}: {
  network: Schema["RunNetwork"];
  health: Schema["Health"];
  view: "overview" | "exceptions";
}) {
  const { day, set } = useTower();
  const activeDay = health.days.includes(day)
    ? day
    : network.warmup_days != null && health.days.includes(network.warmup_days)
      ? network.warmup_days
      : health.days[0]!;
  useEffect(() => {
    if (day !== activeDay) set({ day: activeDay });
  }, [day, activeDay, set]);
  const snapshot = useMemo(
    () => operationalSnapshot(network.network, health, activeDay, catalog.low_cover_days),
    [network, health, activeDay],
  );
  const counts = (state: SiteState) => snapshot.filter((row) => row.state === state).length;
  const exceptions = snapshot.filter((row) => row.state !== "covered");
  const [query, setQuery] = useState("");
  const [echelon, setEchelon] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviews, setReviews] = useState(() => {
    try {
      return readReviews(localStorage.getItem(reviewStorage));
    } catch {
      return {};
    }
  });
  const [storageError, setStorageError] = useState("");
  const isReviewed = (id: string) =>
    reviews[reviewKey(network.network.run_id, activeDay, id)] === true;
  const toggle = (id: string) => {
    const next = { ...reviews };
    const key = reviewKey(network.network.run_id, activeDay, id);
    if (next[key]) delete next[key];
    else next[key] = true;
    setReviews(next);
    try {
      localStorage.setItem(reviewStorage, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError(
        "Browser storage is unavailable. Review marks will last for this session only.",
      );
    }
  };
  const rows = exceptions.filter(
    (row) =>
      (echelon === "all" || row.type === echelon) &&
      `${row.id} ${row.label}`.toLowerCase().includes(query.toLowerCase()) &&
      (reviewFilter === "all" || isReviewed(row.id) === (reviewFilter === "reviewed")),
  );
  const dates = health.days.filter(
    (value) =>
      value <= activeDay &&
      value >= Math.max(network.warmup_days ?? 0, activeDay - catalog.history_days + 1),
  );
  const histories = useMemo(
    () =>
      dates.map((date) => ({
        day: date,
        rows: operationalSnapshot(network.network, health, date, catalog.low_cover_days),
      })),
    [network, health, activeDay],
  );
  const investigate = (node: string) => set({ node, day: activeDay, view: "tower" });
  const countTypes = (type: string) =>
    network.network.nodes.type.filter((value) => value === type).length;
  const fill = network.kpis.metrics.fill_rate?.mean;
  return (
    <div className="space-y-5" data-testid="operations-ready">
      <section className="observation-toolbar">
        <div className="flex flex-wrap items-center gap-3">
          <span className="module-tag">
            <Network size={13} /> {network.network.nodes.id.length} facilities ·{" "}
            {network.network.edges.id.length} lanes
          </span>
          <span className="text-xs text-[var(--secondary)]">
            {network.sku_ids.length} SKUs · {snapshot.length} inventory sites monitored
          </span>
        </div>
        <label className="field">
          Observation day{" "}
          <input
            className="w-20 mono"
            aria-label="Observation day"
            type="number"
            min={health.days[0]}
            max={health.days.at(-1)}
            value={activeDay}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (health.days.includes(value)) set({ day: value });
            }}
          />
        </label>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "CUSTOMER FILL RATE",
            value: fill == null ? "—" : `${number(fill * 100, 2)}%`,
            sub: `${network.kpis.replications} runs · measured-horizon mean`,
            icon: ShieldCheck,
            key: "fill",
          },
          {
            title: "STOCKOUT / BACKLOG",
            value: String(counts("stockout")),
            sub: `Inventory sites · day ${activeDay}`,
            icon: TriangleAlert,
            key: "stockout-site-count",
          },
          {
            title: "LOW COVER",
            value: String(counts("low_cover")),
            sub: `Below ${catalog.low_cover_days} days · excludes stockouts`,
            icon: Package,
            key: "low",
          },
          {
            title: "LANDED COST · INR",
            value: number(network.kpis.metrics.total_landed_cost_inr?.mean, 0),
            sub: "Measured-horizon mean · eight cost accounts",
            icon: Warehouse,
            key: "cost",
          },
        ].map((card) => (
          <article className="metric-card" key={card.key}>
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">{card.title}</p>
              <card.icon
                size={16}
                className={
                  card.key === "stockout-site-count" && counts("stockout")
                    ? "text-[var(--stockout)]"
                    : "text-[var(--accent)]"
                }
              />
            </div>
            <p className="mono mt-5 text-2xl tracking-tight" data-testid={card.key}>
              {card.value}
            </p>
            <p className="mt-3 text-[10px] text-[var(--secondary)]">{card.sub}</p>
          </article>
        ))}
      </div>
      {view === "overview" ? (
        <>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
            <section className="panel p-5" aria-label="Network health by echelon">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">CONNECTED NETWORK</p>
                  <h2 className="mt-2 text-base font-semibold">
                    Every echelon, one operating picture
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open Control Tower"
                  onClick={() => set({ view: "tower" })}
                >
                  <ArrowUpRight />
                </Button>
              </div>
              <div className="network-stages">
                {[
                  [Factory, "Suppliers", countTypes("supplier")],
                  [Warehouse, "DCs", countTypes("dc")],
                  [Package, "Demand nodes", countTypes("retailer") + countTypes("b2b")],
                ].map(([Icon, label, count], i) => {
                  const Symbol = Icon as typeof Factory;
                  return (
                    <div className="contents" key={String(label)}>
                      {i > 0 && <ArrowRight size={16} className="text-[var(--secondary)]" />}
                      <div className="network-stage">
                        <Symbol size={20} />
                        <strong className="mono">{Number(count)}</strong>
                        <span>{String(label)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-4">
                {(
                  [
                    ["dc", "Distribution centres"],
                    ["retailer", "Retailers"],
                    ["b2b", "B2B buyers"],
                  ] as const
                ).map(([type, label]) => (
                  <div key={type}>
                    <div className="mb-2 flex items-center justify-between text-[10px]">
                      <span className="font-medium">{label}</span>
                      <span className="text-[var(--secondary)]">
                        {
                          snapshot.filter((row) => row.type === type && row.state === "stockout")
                            .length
                        }{" "}
                        stockout/backlog
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {snapshot
                        .filter((row) => row.type === type)
                        .sort((a, b) => a.id.localeCompare(b.id))
                        .map((row) => (
                          <button
                            title={`${row.id} · ${row.label} · ${stateLabels[row.state]} · cover ${number(row.cover)} days`}
                            aria-label={`Investigate ${row.id}, ${stateLabels[row.state]}`}
                            className={`site-tile ${classFor(row.state)}`}
                            key={row.id}
                            onClick={() => investigate(row.id)}
                          >
                            {row.state === "stockout" && <span aria-hidden>!</span>}
                            {row.id}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3 border-t border-[var(--border)] pt-4 text-[10px] text-[var(--secondary)]">
                {(["stockout", "low_cover", "covered", "unknown"] as const).map((state) => (
                  <span key={state} className="flex items-center gap-1.5">
                    <i className={`size-2 rounded-sm ${classFor(state)}`} />
                    {stateLabels[state]}
                  </span>
                ))}
              </div>
            </section>
            <StudyPlot
              title="Inventory-site exception trend"
              height={350}
              source={`First replication · ${dates.length} measured days ending at day ${activeDay}. Counts are site observations, not demand-weighted fill rate. Suppliers excluded.`}
              rows={[
                ["day", "stockout_or_backlog_sites", "low_cover_sites"],
                ...histories.map((row) => [
                  row.day,
                  row.rows.filter((site) => site.state === "stockout").length,
                  row.rows.filter((site) => site.state === "low_cover").length,
                ]),
              ]}
              option={{
                legend: {
                  data: ["Stockout / backlog", "Low cover"],
                  top: 8,
                  textStyle: { color: "#71717a", fontSize: 10 },
                },
                grid: { left: 40, right: 20, top: 55, bottom: 35 },
                xAxis: {
                  type: "category",
                  data: dates,
                  name: "Day",
                  nameLocation: "middle",
                  nameGap: 23,
                },
                yAxis: { type: "value", name: "Sites", minInterval: 1 },
                series: [
                  {
                    name: "Stockout / backlog",
                    type: "line",
                    showSymbol: dates.length === 1,
                    itemStyle: { color: "#C2410C" },
                    areaStyle: { color: "#C2410C", opacity: 0.08 },
                    data: histories.map(
                      (row) => row.rows.filter((site) => site.state === "stockout").length,
                    ),
                  },
                  {
                    name: "Low cover",
                    type: "line",
                    showSymbol: dates.length === 1,
                    itemStyle: { color: "#2B5C8A" },
                    data: histories.map(
                      (row) => row.rows.filter((site) => site.state === "low_cover").length,
                    ),
                  },
                ],
              }}
            />
          </div>
          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">NEXT ACTIONS</p>
                <h2 className="mt-2 text-base font-semibold">
                  Start where service needs attention
                </h2>
              </div>
              <Button
                variant="outline"
                aria-label="Open exception workbench"
                onClick={() => set({ view: "exceptions" })}
              >
                Open workbench <ArrowRight />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {exceptions.slice(0, 3).map((row) => (
                <button className="action-site" key={row.id} onClick={() => investigate(row.id)}>
                  <span className={`status-badge ${classFor(row.state)}`}>
                    {stateLabels[row.state]}
                  </span>
                  <span className="mt-3 block text-sm font-medium">{row.label}</span>
                  <span className="mt-2 flex items-center justify-between text-xs text-[var(--secondary)]">
                    <span>
                      {row.id} · {number(row.cover, 1)} days cover
                    </span>
                    <ArrowUpRight size={14} />
                  </span>
                </button>
              ))}
              {!exceptions.length && (
                <p className="text-sm text-[var(--secondary)]">
                  No inventory-site exceptions on the selected day.
                </p>
              )}
            </div>
          </section>
          <StudyPlot
            title="Service-risk history by inventory site"
            height={Math.max(280, snapshot.length * 15 + 90)}
            source="First-replication observations. Orange = stockout/backlog; blue shades = cover status; grey = unavailable. Supplier stock is excluded. These are observed states, not predicted outage probabilities."
            rows={[
              ["day", "site", "state", "cover_days"],
              ...histories.flatMap((row) =>
                row.rows.map((site) => [row.day, site.id, stateLabels[site.state], site.cover]),
              ),
            ]}
            option={{
              grid: { left: 60, right: 15, top: 20, bottom: 70 },
              tooltip: { trigger: "item" },
              xAxis: { type: "category", data: dates, axisLabel: { fontSize: 9 } },
              yAxis: {
                type: "category",
                data: snapshot.map((row) => row.id).sort(),
                axisLabel: { fontSize: 9 },
              },
              visualMap: {
                type: "piecewise",
                orient: "horizontal",
                left: "center",
                bottom: 0,
                textStyle: { color: "#71717a", fontSize: 10 },
                pieces: [
                  { value: 1, label: "Stockout / backlog", color: "#C2410C" },
                  { value: 2, label: "Low cover", color: "#b3c9dc" },
                  { value: 3, label: "Covered", color: "#2B5C8A" },
                  { value: 0, label: "Unavailable", color: "#d4d4d8" },
                ],
              },
              series: [
                {
                  type: "heatmap",
                  data: histories.flatMap((row, x) =>
                    row.rows.map((site) => [
                      x,
                      snapshot
                        .map((entry) => entry.id)
                        .sort()
                        .indexOf(site.id),
                      { unknown: 0, stockout: 1, low_cover: 2, covered: 3 }[site.state],
                    ]),
                  ),
                  itemStyle: { borderWidth: 1, borderColor: "#fafafa" },
                },
              ],
            }}
          />
          <section className="workspace-callout">
            <div>
              <p className="eyebrow">TEST YOUR NEXT OPERATING DECISION</p>
              <h2 className="mt-2 text-lg font-semibold">
                What happens if a supplier stops or demand surges?
              </h2>
              <p className="mt-2 text-xs leading-6 text-[var(--secondary)]">
                Choose a documented playbook and compare matching-seed scenarios.
              </p>
            </div>
            <Button onClick={() => set({ view: "playbooks" })}>
              Explore scenario playbooks <ArrowRight />
            </Button>
          </section>
        </>
      ) : (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] p-5">
            <div>
              <h2 className="text-base font-semibold">Operational exceptions</h2>
              <p className="mt-2 text-xs leading-6 text-[var(--secondary)]">
                Stockouts first, then low cover, then unavailable cover. Review marks stay in this
                browser for this run, day and site; they do not resolve simulated shortages.
              </p>
            </div>
            <Button
              variant="outline"
              aria-label="Export exceptions CSV"
              onClick={() =>
                download(
                  `exceptions-day-${activeDay}.csv`,
                  csv([
                    [
                      "run",
                      "day",
                      "site",
                      "name",
                      "echelon",
                      "state",
                      "cover_days",
                      "local_review",
                    ],
                    ...rows.map((row) => [
                      network.network.run_id,
                      activeDay,
                      row.id,
                      row.label,
                      row.type,
                      stateLabels[row.state],
                      row.cover,
                      isReviewed(row.id) ? "reviewed" : "unreviewed",
                    ]),
                  ]),
                )
              }
            >
              <Download />
              Export CSV
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-[var(--muted)] p-4">
            <input
              className="min-w-0 flex-1"
              aria-label="Search exception sites"
              placeholder="Search a facility or site ID…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Exception echelon"
              value={echelon}
              onChange={(event) => setEchelon(event.target.value)}
            >
              <option value="all">All echelons</option>
              <option value="dc">Distribution centres</option>
              <option value="retailer">Retailers</option>
              <option value="b2b">B2B buyers</option>
            </select>
            <select
              aria-label="Review state"
              value={reviewFilter}
              onChange={(event) => setReviewFilter(event.target.value)}
            >
              <option value="all">All review states</option>
              <option value="unreviewed">Needs review</option>
              <option value="reviewed">Reviewed locally</option>
            </select>
            <span className="mono text-xs">{rows.length} sites</span>
          </div>
          {storageError && (
            <p role="alert" className="px-5 py-3 text-xs">
              {storageError}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="operations-table" aria-label="Operational exceptions">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Echelon</th>
                  <th>Observed exception</th>
                  <th>Cover · days</th>
                  <th>Local review</th>
                  <th>Investigation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="font-medium">{row.label}</span>
                      <span className="mono mt-1 block text-[10px] text-[var(--secondary)]">
                        {row.id}
                      </span>
                    </td>
                    <td>{row.type === "dc" ? "DC" : row.type}</td>
                    <td>
                      <span className={`status-badge ${classFor(row.state)}`}>
                        {row.state === "stockout" && "! "}
                        {stateLabels[row.state]}
                      </span>
                    </td>
                    <td className="mono">{number(row.cover, 2)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        aria-label={
                          isReviewed(row.id) ? `Reopen ${row.id}` : `Mark ${row.id} reviewed`
                        }
                        onClick={() => toggle(row.id)}
                      >
                        <CheckCheck />
                        {isReviewed(row.id) ? "Reviewed" : "Mark reviewed"}
                      </Button>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        aria-label={`Investigate ${row.id}`}
                        onClick={() => investigate(row.id)}
                      >
                        Investigate <ArrowUpRight />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="p-10 text-center text-sm text-[var(--secondary)]">
              No exceptions match these filters.
            </p>
          )}
        </section>
      )}
      <p className="break-all text-[10px] leading-6 text-[var(--secondary)]">
        Run {network.network.run_id} · day {activeDay}
        {activeDay < (network.warmup_days ?? 0) ? " · WARM-UP" : " · measured window"} · first
        replication for site observations; horizon means use all replications. Low-cover threshold{" "}
        {catalog.low_cover_days} days is a review assumption, not a replenishment order.{" "}
        {counts("unknown")} sites have unavailable cover. Synthetic operations model.
      </p>
    </div>
  );
}
