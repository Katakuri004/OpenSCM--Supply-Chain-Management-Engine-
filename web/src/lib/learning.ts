import type { Schema } from "./tower";

export function differenceIndicator(estimate: { mean: number | null; ci95?: number[] | null }) {
  if (estimate.mean === null) return "Unavailable";
  if (!estimate.ci95) return "More replications needed";
  const [low, high] = estimate.ci95;
  if (low === 0 && high === 0) return "No observed difference";
  if (low! > 0) return "B higher";
  if (high! < 0) return "B lower";
  return "Difference uncertain";
}
export function requestDifferences(
  a: unknown,
  b: unknown,
  path = "",
): { input: string; a: string; b: string }[] {
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .flatMap((key) => requestDifferences(left[key], right[key], path ? `${path}.${key}` : key));
  }
  return JSON.stringify(a) === JSON.stringify(b)
    ? []
    : [
        {
          input: path,
          a: JSON.stringify(a) ?? "Inherited default",
          b: JSON.stringify(b) ?? "Inherited default",
        },
      ];
}
export function summarizeSeries(values: (number | null)[]) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    count: valid.length,
    missing: values.length - valid.length,
    mean: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
    min: valid.length ? Math.min(...valid) : null,
    max: valid.length ? Math.max(...valid) : null,
  };
}
export function readNotebook(raw: string | null): { prediction: string; reflection: string } {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "prediction" in value &&
      "reflection" in value &&
      typeof value.prediction === "string" &&
      typeof value.reflection === "string"
    )
      return { prediction: value.prediction, reflection: value.reflection };
  } catch {
    /* A damaged notebook must not prevent access to the simulator. */
  }
  return { prediction: "", reflection: "" };
}
export const seriesDefinitions = {
  on_hand: {
    label: "Closing on-hand",
    unit: "units",
    definition:
      "Physical stock after demand and dispatch; differs from time-weighted average stock.",
  },
  on_order: {
    label: "Closing on-order",
    unit: "units",
    definition: "Outstanding replenishment units, including stock in the pipeline.",
  },
  backorders: {
    label: "Closing backlog",
    unit: "units",
    definition: "Unfilled customer demand plus pending upstream orders at the selected node.",
  },
  fill_rate: {
    label: "Immediate fill rate",
    unit: "fraction",
    definition:
      "Same-day service divided by today's demand signal. Zero demand is unavailable, not 0%.",
  },
  days_of_cover: {
    label: "Days of cover",
    unit: "days",
    definition:
      "Closing on-hand divided by the planning demand estimate; undefined with no positive denominator.",
  },
  demand: {
    label: "Observed demand signal",
    unit: "units/day",
    definition:
      "Customer demand at retailers/buyers; downstream replenishment orders at DCs/suppliers. Not additive across echelons.",
  },
  immediate: {
    label: "Immediate service",
    unit: "units/day",
    definition:
      "Units of today's demand/order signal served that day; excludes later backlog clearance.",
  },
  orders: {
    label: "Replenishment orders",
    unit: "units/day",
    definition:
      "Orders placed upstream after review. Suppliers have no upstream replenishment orders.",
  },
  received: {
    label: "Receipts",
    unit: "units/day",
    definition: "Shipments arriving today; supplier production is separate and is not a receipt.",
  },
  forecast: {
    label: "Pre-demand forecast",
    unit: "units/day",
    definition:
      "Estimate logged before today's demand is observed. Unavailable with known-demand policies and at suppliers. POS sharing can change the DC forecast signal.",
  },
} as const;
export type SeriesMetric = keyof typeof seriesDefinitions;
export type LearningResult = {
  comparison: Schema["Comparison"];
  a: Schema["Kpis"];
  b: Schema["Kpis"];
  provenance: Schema["RunProvenance"][];
};
