import type { ElementDefinition } from "cytoscape";
import type { components } from "./api/schema";
export type Schema = components["schemas"];
export type Network = Schema["Network"];
export type Observation = { id: string; type: string; value: number | null };

export function coverColor(cover: number | null, stockout: boolean): string {
  if (stockout) return "#C2410C";
  if (cover === null) return "#d4d4d8";
  return `hsl(209, 40%, ${90 - Math.min(Math.max(cover, 0) / 21, 1) * 50}%)`;
}
export function networkElements(network: Network): ElementDefinition[] {
  const { nodes, edges } = network;
  const group = (type: string) => (type === "supplier" ? 0 : type === "dc" ? 1 : 2);
  const ranks = [0, 1, 2].map((g) =>
    nodes.id
      .map((_, i) => i)
      .filter((i) => group(nodes.type[i]!) === g)
      .sort(
        (a, b) =>
          nodes.latitude[b]! - nodes.latitude[a]! || nodes.longitude[a]! - nodes.longitude[b]!,
      ),
  );
  return [
    ...nodes.id.map((id, i) => ({
      data: {
        id,
        label: id,
        name: nodes.label[i],
        shape: { supplier: "diamond", dc: "rectangle", retailer: "ellipse", b2b: "hexagon" }[
          nodes.type[i]!
        ],
        color: "#d4d4d8",
        stockout: "",
        opacity: 1,
      },
      position: {
        x:
          group(nodes.type[i]!) * 320 +
          80 +
          (group(nodes.type[i]!) === 2 ? Math.floor(ranks[2]!.indexOf(i) / 14) * 180 : 0),
        y:
          50 +
          (group(nodes.type[i]!) === 2
            ? (ranks[2]!.indexOf(i) % 14) * 38
            : (ranks[group(nodes.type[i]!)]!.indexOf(i) * 494) /
              Math.max(1, ranks[group(nodes.type[i]!)]!.length - 1)),
      },
      grabbable: false,
    })),
    ...edges.id.map((id, i) => ({
      data: {
        id,
        source: edges.source[i],
        target: edges.target[i],
        width: 0.6 + Math.sqrt(edges.flow_units[i]! / Math.max(...edges.flow_units, 1)) * 4,
      },
    })),
  ];
}
export function upstream(network: Network, node: string): Set<string> {
  const found = new Set([node]);
  for (let pass = 0; pass < network.nodes.id.length; pass++) {
    const before = found.size;
    network.edges.target.forEach((target, i) => {
      if (found.has(target)) found.add(network.edges.source[i]!);
    });
    if (before === found.size) break;
  }
  return found;
}
export function filterRows(rows: Observation[], query: Schema["Query"]): Observation[] {
  return rows.filter((row) => {
    if (row.value === null || (query.node_type && row.type !== query.node_type)) return false;
    return {
      lt: row.value < query.value,
      le: row.value <= query.value,
      eq: row.value === query.value,
      ge: row.value >= query.value,
      gt: row.value > query.value,
    }[query.operator];
  });
}
export function csv(rows: (string | number | null)[][]): string {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = value === null ? "" : String(value);
            if (/^[=+@\-\t\r]/.test(text) && typeof value === "string") text = "'" + text;
            return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
          })
          .join(","),
      )
      .join("\n") + "\n"
  );
}
export function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export const number = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value);
