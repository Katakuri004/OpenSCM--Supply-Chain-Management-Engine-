import { describe, expect, it } from "vitest";
import { annualInventoryCost, economicQuantity, selectCases } from "../src/lib/labs";

describe("Study view calculations", () => {
  it("has the textbook EOQ minimum without purchase cost", () => {
    const q = economicQuantity(3650, 10, 7.3);
    expect(q).toBeCloseTo(100);
    expect(annualInventoryCost(q, 3650, 10, 7.3)).toBeCloseTo(730);
    expect(annualInventoryCost(50, 3650, 10, 7.3)).toBeGreaterThan(730);
  });
  it("selects saved factor cells without inventing missing outcomes", () => {
    const cases = [
      { case_id: "a", factors: { dc_count: 1, rho: 0.3 } },
      { case_id: "b", factors: { dc_count: 4, rho: 0.6 } },
    ];
    expect(selectCases(cases, { rho: 0.3 }).map((row) => row.case_id)).toEqual(["a"]);
    expect(selectCases(cases, { rho: 0.9 })).toEqual([]);
  });
});
