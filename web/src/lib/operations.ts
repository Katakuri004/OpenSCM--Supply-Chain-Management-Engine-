import type { Network, Schema } from "./tower";

export type SiteState = "stockout" | "low_cover" | "unknown" | "covered";
export type SiteObservation = {
  id: string;
  label: string;
  type: Schema["Network"]["nodes"]["type"][number];
  cover: number | null;
  state: SiteState;
};
export const stateLabels: Record<SiteState, string> = {
  stockout: "Stockout / backlog",
  low_cover: "Low cover",
  unknown: "Cover unavailable",
  covered: "Covered",
};
export function operationalSnapshot(
  network: Network,
  health: Schema["Health"],
  day: number,
  threshold: number,
): SiteObservation[] {
  const column = health.days.indexOf(day);
  if (column < 0) throw new Error("Observation day is outside the available horizon.");
  const rows = new Map(health.node_ids.map((id, i) => [id, i]));
  const priority = { stockout: 0, low_cover: 1, unknown: 2, covered: 3 };
  return network.nodes.id
    .flatMap((id, i): SiteObservation[] => {
      if (network.nodes.type[i] === "supplier") return [];
      const row = rows.get(id);
      const cover = row === undefined ? null : (health.days_of_cover[row]?.[column] ?? null);
      const stockout = row !== undefined && health.stockout[row]?.[column] === true;
      return [
        {
          id,
          label: network.nodes.label[i]!,
          type: network.nodes.type[i]!,
          cover,
          state: stockout
            ? "stockout"
            : cover === null
              ? "unknown"
              : cover < threshold
                ? "low_cover"
                : "covered",
        },
      ];
    })
    .sort(
      (a, b) =>
        priority[a.state] - priority[b.state] ||
        (a.cover ?? Infinity) - (b.cover ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
}
export function reviewKey(run: string, day: number, site: string) {
  return JSON.stringify([run, day, site]);
}
export function readReviews(raw: string | null): Record<string, true> {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, reviewed]) => reviewed === true));
  } catch {
    return {};
  }
}
