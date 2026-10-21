import { createSupplyChainClient } from "../src/lib/api/client";
import type { components } from "../src/lib/api/schema";

const client = createSupplyChainClient();
const request: components["schemas"]["RunRequest"] = { seed: 42, replications: 1 };
void client.POST("/runs", { body: request });
void client.GET("/runs/{run_id}/timeseries", {
  params: { path: { run_id: "abc" }, query: { node: "R01", sku: "SKU01", metrics: ["fill_rate"] } },
});
// @ts-expect-error Only registered API paths are accepted.
void client.GET("/unregistered");
// @ts-expect-error Root seeds must be numbers.
const invalidSeed: components["schemas"]["RunRequest"] = { seed: "forty-two" };
void invalidSeed;
// @ts-expect-error Only whitelisted metrics are accepted.
const invalidMetric: components["schemas"]["Query"] = { metric: "sql", operator: "lt", value: 1 };
void invalidMetric;
