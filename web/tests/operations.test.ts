import { describe, expect, it } from "vitest";
import { operationalSnapshot, reviewKey, readReviews } from "../src/lib/operations";
import type { Schema } from "../src/lib/tower";
import rawNetwork from "../../contracts/fixtures/network.json";

const network = rawNetwork as Schema["Network"];

const health: Schema["Health"] = {
  run_id: network.run_id,
  node_ids: ["S1", "DC1", "R1"],
  days: [90, 91],
  days_of_cover: [
    [0, null],
    [3, null],
    [1, 10],
  ],
  stockout: [
    [false, false],
    [true, false],
    [false, false],
  ],
};
describe("Operations snapshot", () => {
  it("prioritizes stockout observations, excludes suppliers and never counts missing cover as zero", () => {
    const rows = operationalSnapshot(network, health, 90, 7);
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ["DC1", "stockout"],
      ["R1", "low_cover"],
    ]);
    expect(operationalSnapshot(network, health, 91, 7).map((row) => row.state)).toEqual([
      "unknown",
      "covered",
    ]);
  });
  it("rejects absent days rather than presenting stale observations", () => {
    expect(() => operationalSnapshot(network, health, 500, 7)).toThrow(/day/);
  });
  it("scopes review state to a run, simulation day and site; tolerates damaged local storage", () => {
    expect(reviewKey("runA", 90, "DC1")).not.toBe(reviewKey("runB", 90, "DC1"));
    expect(reviewKey("runA", 90, "DC1")).not.toBe(reviewKey("runA", 91, "DC1"));
    expect(readReviews("not JSON")).toEqual({});
    expect(readReviews("[true]")).toEqual({});
    expect(readReviews('{"a":true,"b":"true","c":false}')).toEqual({ a: true });
  });
});
