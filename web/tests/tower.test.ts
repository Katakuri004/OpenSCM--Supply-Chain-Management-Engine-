import { describe, expect, it } from "vitest";
import { coverColor, csv, filterRows, networkElements, upstream } from "../src/lib/tower";
import type { Network } from "../src/lib/tower";
import rawNetwork from "../../contracts/fixtures/network.json";
import { fixtureQuery, type Fixture } from "../src/lib/data";
import { readFileSync } from "node:fs";

const network = rawNetwork as Network;
const fixture = JSON.parse(readFileSync("public/fixtures/tower.json", "utf8")) as Fixture;

describe("Control Tower observations", () => {
  it("resolves recorded percentage phrases and structured filters to the same observations", () => {
    const phrase = fixtureQuery(fixture, { text: "retailers with fill rate < 95%" }, 100);
    expect(fixtureQuery(fixture, { filter: phrase.filter }, 100)).toEqual(phrase);
    expect(phrase.values.every((value) => value < 0.95)).toBe(true);
    expect(() => fixtureQuery(fixture, { text: "nodes with on hand < 1; DELETE" }, 100)).toThrow();
    expect(() => fixtureQuery(fixture, { text: "nodes with fill rate < 200%" }, 100)).toThrow();
  });
  it("uses one cover hue, reserves orange for stockouts and handles missing cover", () => {
    expect(coverColor(null, false)).toBe("#d4d4d8");
    expect(coverColor(0, true)).toBe("#C2410C");
    expect(coverColor(2, false)).not.toBe(coverColor(20, false));
  });
  it("keeps physical lane endpoints, shapes and deterministic echelon positions", () => {
    const elements = networkElements(network);
    expect(elements).toHaveLength(5);
    expect(elements[0]?.data.shape).toBe("diamond");
    expect(elements[1]?.data.shape).toBe("rectangle");
    expect(elements[3]?.data.source).toBe("S1");
    expect(upstream(network, "R1")).toEqual(new Set(["R1", "DC1", "S1"]));
  });
  it("filters numeric observations without treating null as zero", () => {
    const rows = [
      { id: "R1", type: "retailer", value: null },
      { id: "DC1", type: "dc", value: 7 },
    ];
    expect(filterRows(rows, { metric: "days_of_cover", operator: "lt", value: 8 })).toEqual([
      rows[1],
    ]);
    expect(filterRows(rows, { metric: "days_of_cover", operator: "gt", value: 8 })).toEqual([]);
  });
  it("escapes CSV cells and neutralizes spreadsheet formulas", () => {
    expect(
      csv([
        ["node", "value"],
        ["=SUM(A1)", 'a,"b'],
      ]),
    ).toBe('node,value\n\'=SUM(A1),"a,""b"\n');
  });
});
