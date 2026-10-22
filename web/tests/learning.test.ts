import { expect, it } from "vitest";
import {
  differenceIndicator,
  requestDifferences,
  summarizeSeries,
  readNotebook,
} from "../src/lib/learning";

it("explains interval uncertainty without labelling a noisy mean a win", () => {
  expect(differenceIndicator({ mean: 2, ci95: [-1, 5] })).toBe("Difference uncertain");
  expect(differenceIndicator({ mean: 2, ci95: [1, 3] })).toBe("B higher");
  expect(differenceIndicator({ mean: -2, ci95: [-3, -1] })).toBe("B lower");
  expect(differenceIndicator({ mean: 0, ci95: [0, 0] })).toBe("No observed difference");
  expect(differenceIndicator({ mean: 2 })).toBe("More replications needed");
  expect(differenceIndicator({ mean: null })).toBe("Unavailable");
});
it("shows nested and missing input changes and ignores object key order", () => {
  expect(
    requestDifferences({ lab: { buffer_days: 0 }, seed: 1 }, { seed: 1, lab: { buffer_days: 7 } }),
  ).toEqual([{ input: "lab.buffer_days", a: "0", b: "7" }]);
  expect(
    requestDifferences({ lab: {} }, { lab: { suppliers: { S1: { delay_days: 2 } } } }),
  ).toHaveLength(1);
});
it("keeps missing observations separate from zeros and restores only valid notebook text", () => {
  expect(summarizeSeries([null, 0, 2])).toEqual({ count: 2, missing: 1, mean: 1, min: 0, max: 2 });
  expect(summarizeSeries([null]).mean).toBeNull();
  expect(readNotebook('{"prediction":"Inventory rises","reflection":""}').prediction).toBe(
    "Inventory rises",
  );
  expect(readNotebook('{"prediction":5}')).toEqual({ prediction: "", reflection: "" });
  expect(readNotebook("broken")).toEqual({ prediction: "", reflection: "" });
});
