import type { Schema } from "./tower";
import lessons from "../fixtures/learning.json";
import limits from "../fixtures/cases.json";

export type CaseDraft = Schema["DecisionCaseDraft"];
export type SavedCase = Schema["SavedDecisionCase"];
export function caseDefinition(value: SavedCase): CaseDraft {
  const {
    id: _id,
    revision: _revision,
    created_at: _created,
    updated_at: _updated,
    ...draft
  } = value;
  return draft;
}
export function starterCase(lessonId = limits.initial_lesson): CaseDraft {
  const lesson = lessons.lessons.find((row) => row.id === lessonId) ?? lessons.lessons[0]!;
  return {
    format_version: 1,
    name: lesson.title,
    question: lesson.question,
    assumptions: lesson.assumption,
    prediction: "",
    observations: "",
    reflection: "",
    decision: "",
    lesson_id: lesson.id,
    goals: { service_floor: lessons.service_goal },
    baseline: structuredClone(lesson.request_a) as Schema["RunRequest"],
    alternative: structuredClone(lesson.request_b) as Schema["RunRequest"],
  };
}
export function assessGoal(
  estimate: { mean: number | null; ci95?: number[] | null } | undefined,
  target: number,
  direction: "min" | "max",
) {
  if (estimate?.mean == null) return "Unavailable";
  if (!estimate.ci95) return "More replications needed";
  const [low, high] = estimate.ci95 as [number, number];
  if (direction === "min")
    return low >= target ? "Meets goal" : high < target ? "Misses goal" : "Uncertain";
  return high <= target ? "Meets goal" : low > target ? "Misses goal" : "Uncertain";
}
export type RecoveredCase = { revision: number; definition: CaseDraft };
export function readCaseDraft(raw: string | null): RecoveredCase | null {
  try {
    const value = JSON.parse(raw ?? "null") as RecoveredCase | null;
    if (
      !value ||
      !Number.isInteger(value.revision) ||
      value.revision < 1 ||
      value.definition?.format_version !== 1 ||
      typeof value.definition.name !== "string" ||
      typeof value.definition.question !== "string" ||
      !value.definition.baseline ||
      !value.definition.alternative
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export const draftKey = (id: string) => `openscm-case-draft-v1:${id}`;
