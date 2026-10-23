import { describe, it, expect } from "vitest";
import { assessGoal, readCaseDraft, starterCase } from "../src/lib/cases";

describe("case acceptance evidence", () => {
  it("distinguishes supported, breached, uncertain and missing evidence", () => {
    expect(assessGoal({ mean: 0.96, ci95: [0.94, 0.98] }, 0.95, "min")).toBe("Uncertain");
    expect(assessGoal({ mean: 0.96, ci95: [0.95, 0.98] }, 0.95, "min")).toBe("Meets goal");
    expect(assessGoal({ mean: 0.9, ci95: [0.85, 0.94] }, 0.95, "min")).toBe("Misses goal");
    expect(assessGoal({ mean: 0, ci95: [0, 0] }, 0, "max")).toBe("Meets goal");
    expect(assessGoal({ mean: 3, ci95: [2, 4] }, 1, "max")).toBe("Misses goal");
    expect(assessGoal({ mean: 0.99 }, 0.95, "min")).toBe("More replications needed");
    expect(assessGoal({ mean: null }, 0.95, "min")).toBe("Unavailable");
  });
  it("rejects malformed local draft data", () => {
    expect(readCaseDraft("broken")).toBeNull();
    expect(readCaseDraft('{"revision":1,"definition":{}}')).toBeNull();
    expect(readCaseDraft(null)).toBeNull();
    const draft = { revision: 7, definition: starterCase() };
    expect(readCaseDraft(JSON.stringify(draft))).toEqual(draft);
    expect(readCaseDraft(JSON.stringify({ ...draft, revision: 0 }))).toBeNull();
    expect(
      readCaseDraft(
        JSON.stringify({ ...draft, definition: { ...draft.definition, format_version: 2 } }),
      ),
    ).toBeNull();
  });
});
