import { createSupplyChainClient } from "./api/client";
import { filterRows, type Schema } from "./tower";
export const client = createSupplyChainClient(process.env.NEXT_PUBLIC_API_URL || "/api");
export function read<T>({ data, error }: { data?: T | undefined; error?: unknown }): T {
  if (data === undefined)
    throw new Error(
      typeof error === "object" && error !== null && "detail" in error
        ? [
            String(error.detail),
            ...("issues" in error && Array.isArray(error.issues) ? error.issues.map(String) : []),
          ].join(" · ")
        : "The study service could not complete this request.",
    );
  return data;
}
export type Fixture = {
  status: Schema["RunStatus"];
  request: Schema["RunRequest"];
  catalog: Schema["ScenarioCatalog"];
  network: Schema["RunNetwork"];
  health: Schema["Health"];
  sku: string;
  series: Record<string, Schema["TimeSeries"]>;
  kpis: Record<string, Schema["Kpis"]>;
  observations: { day: number[]; node_id: string[]; node_type: string[] } & Record<
    Schema["Query"]["metric"],
    (number | null)[]
  >;
};
export async function loadFixture(): Promise<Fixture> {
  const response = await fetch("/fixtures/tower.json");
  if (!response.ok) throw new Error("The recorded study could not be loaded. Reload to retry.");
  return response.json() as Promise<Fixture>;
}
export function fixtureQuery(
  fixture: Fixture,
  request: Schema["QueryRequest"],
  day: number,
): Schema["QueryResults"] {
  let filter = request.filter;
  if (!filter) {
    const match =
      /^(nodes|warehouses|dcs|retailers|suppliers|buyers) with (days of cover|fill rate|on hand|on order|backorders) (<=|>=|<|>|=) ([0-9]+(?:\.[0-9]+)?)(%)?$/.exec(
        (request.text ?? "").trim().toLowerCase(),
      );
    if (!match || (match[5] && match[2] !== "fill rate"))
      throw new Error(
        "Use a node group, metric, operator and number; for example: warehouses with days of cover < 7",
      );
    const kinds = {
      nodes: null,
      warehouses: "dc",
      dcs: "dc",
      retailers: "retailer",
      suppliers: "supplier",
      buyers: "b2b",
    } as const;
    const metrics = {
      "days of cover": "days_of_cover",
      "fill rate": "fill_rate",
      "on hand": "on_hand",
      "on order": "on_order",
      backorders: "backorders",
    } as const;
    const operators = { "<": "lt", "<=": "le", "=": "eq", ">=": "ge", ">": "gt" } as const;
    filter = {
      node_type: kinds[match[1] as keyof typeof kinds],
      metric: metrics[match[2] as keyof typeof metrics],
      operator: operators[match[3] as keyof typeof operators],
      value: Number(match[4]) / (match[5] ? 100 : 1),
    };
  }
  if (filter.metric === "fill_rate" && filter.value > 1)
    throw new Error("Fill-rate thresholds use fractions, or a percent in phrases.");
  const table = fixture.observations;
  const rows = filterRows(
    table.day.flatMap((value, i) =>
      value === day
        ? [
            {
              id: table.node_id[i]!,
              type: table.node_type[i]!,
              value: table[filter.metric][i] ?? null,
            },
          ]
        : [],
    ),
    filter,
  );
  return {
    run_id: fixture.status.run_id,
    day,
    filter,
    node_ids: rows.map((r) => r.id),
    node_types: rows.map((r) => r.type as Schema["QueryResults"]["node_types"][number]),
    values: rows.map((r) => r.value!),
  };
}
