import { expect, it } from "vitest";
import starter from "../src/fixtures/builder.json";
import {
  renameFacility,
  removeFacility,
  addFacility,
  connectCustomer,
  moveFacilities,
  type BuilderRequest,
} from "../src/lib/builder";

const request = () => structuredClone(starter.request) as BuilderRequest;
it("separates diagram positions from geographic edits without moving untouched facilities", () => {
  const draft = request();
  const supplier = draft.model.spec.suppliers[0]!;
  const positions = {
    [supplier.id]: { x: (supplier.longitude + 180) * 6, y: (90 - supplier.latitude) * 6 },
    DC1: { x: 1500, y: 400 },
  };
  const diagram = moveFacilities(draft, positions, false);
  expect(diagram.model.spec).toEqual(draft.model.spec);
  const geography = moveFacilities(draft, positions, true);
  expect(geography.model.spec.suppliers[0]).toEqual(supplier);
  expect(geography.model.spec.dcs[0]!.longitude).toBe(70);
  expect(geography.model.positions).toEqual(draft.model.positions);
});
it("renames facilities and all sourcing, routing, lane and layout references atomically", () => {
  const draft = request();
  draft.model.spec.assignments = { R01: "DC1" };
  draft.model.spec.lanes = [{ source: "S1", target: "DC1" }];
  draft.model.positions = { DC1: { x: 1, y: 2 } };
  const renamed = renameFacility(draft, "DC1", "NCR");
  expect(renamed.model.spec.assignments?.R01).toBe("NCR");
  expect(renamed.model.spec.lanes?.[0]?.target).toBe("NCR");
  expect(renamed.model.positions?.NCR).toEqual({ x: 1, y: 2 });
  expect(draft.model.spec.dcs[0]?.id).toBe("DC1");
  expect(() => renameFacility(draft, "DC1", "S1")).toThrow();
});
it("blocks removing a referenced supplier and cleans deleted customer routes", () => {
  expect(() => removeFacility(request(), "S1")).toThrow(/SKU/);
  const draft = request();
  draft.model.spec.assignments = { R01: "DC1" };
  const result = removeFacility(draft, "R01");
  expect(result.model.spec.assignments?.R01).toBeUndefined();
  expect(result.model.spec.customers).toHaveLength(27);
});
it("duplicates with unique IDs and connects a customer to an open DC", () => {
  const draft = request();
  const added = addFacility(draft, "dc", "DC1");
  expect(new Set(added.model.spec.dcs.map((row) => row.id)).size).toBe(9);
  const connected = connectCustomer(draft, "DC2", "R01", ["DC1", "DC2", "DC3", "DC5"]);
  expect(connected.model.spec.assignments?.R01).toBe("DC2");
  expect(() => connectCustomer(draft, "S1", "R01", ["DC1"])).toThrow();
});
