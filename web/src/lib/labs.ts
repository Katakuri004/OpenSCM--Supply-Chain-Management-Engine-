import type { Schema } from "./tower";
import { client, read } from "./data";
export type Study = Schema["StudyEvidence"];
export type Experiment = Schema["StudyExperiment"];

export async function loadStudy(mode: "fixture" | "live"): Promise<Study> {
  if (mode === "live") return read(await client.GET("/studies"));
  const response = await fetch("/fixtures/studies.json");
  if (!response.ok) throw new Error("Recorded study evidence is unavailable.");
  return response.json() as Promise<Study>;
}
export function economicQuantity(demand: number, ordering: number, holding: number) {
  if (!Number.isFinite(demand + ordering + holding) || demand < 0 || ordering <= 0 || holding <= 0)
    throw new Error("EOQ requires nonnegative demand and positive costs.");
  return Math.sqrt((2 * demand * ordering) / holding);
}
export function annualInventoryCost(q: number, demand: number, ordering: number, holding: number) {
  if (q <= 0) throw new Error("Order quantity must be positive.");
  return (demand * ordering) / q + (holding * q) / 2;
}
export function selectCases<
  T extends { case_id: string; factors: Record<string, string | number | boolean> },
>(cases: T[], factors: Record<string, string | number | boolean>) {
  return cases.filter((row) =>
    Object.entries(factors).every(([key, value]) => row.factors[key] === value),
  );
}
export function estimate(
  experiment: Experiment,
  caseId: string,
  metric: string,
  phase = "evaluation",
) {
  return experiment.estimates.find(
    (row) => row.case_id === caseId && row.metric === metric && row.phase === phase,
  );
}
export const costComponents = [
  "purchase",
  "inbound_freight",
  "outbound_freight",
  "holding",
  "ordering",
  "dc_fixed",
  "shortage",
  "handling",
];
export const colors = [
  "#27272a",
  "#52525b",
  "#71717a",
  "#a1a1aa",
  "#d4d4d8",
  "#e4e4e7",
  "#b3c9dc",
  "#2B5C8A",
];
