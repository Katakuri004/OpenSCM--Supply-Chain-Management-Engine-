import { test, expect } from "@playwright/test";

let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

test("recorded Control Tower supports inspection, queries and local scrubbing", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-powered-by"]).toBe("Next.js");
  await expect(page).toHaveTitle("OpenSCM · Control Tower");
  await expect(page.getByRole("heading", { name: "Control Tower" })).toBeVisible();
  await expect(page.getByTestId("network")).toHaveAttribute("data-node-count", "36");
  await page.getByLabel("Inspect node", { exact: true }).selectOption("R01");
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delhi north retail" })).toBeVisible();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export inventory CSV" }).click();
  expect((await exported).suggestedFilename()).toBe("inventory-R01.csv");
  await expect(page.getByRole("dialog")).toHaveScreenshot("inspector.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(page.getByRole("button", { name: "Open inspector" })).toBeFocused();
  await page.getByLabel("Query phrase").fill("warehouses with days of cover < 7");
  await page.getByRole("button", { name: "Apply query" }).click();
  await expect(page.getByRole("table", { name: "Query matches" })).toBeVisible();
  let requests = 0;
  page.on("request", () => requests++);
  const slider = page.getByLabel("Simulation day");
  await slider.focus();
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(page).toHaveURL(/day=92/);
  expect(requests).toBe(0);
  await expect(page).toHaveScreenshot("control-tower-light.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByLabel("Simulation day")).toHaveValue("92");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page).toHaveScreenshot("control-tower.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("100-node health updates stay local and responsive", async ({ page }, testInfo) => {
  await page.route("**/fixtures/tower.json", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const nodes = data.network.network.nodes;
    while (nodes.id.length < 100) {
      const i = nodes.id.length;
      nodes.id.push(`LOAD${i}`);
      nodes.label.push(`Load-test retailer ${i}`);
      nodes.type.push("retailer");
      nodes.latitude.push(0);
      nodes.longitude.push(0);
      const lanes = data.network.network.edges;
      lanes.id.push(`DC1_LOAD${i}`);
      lanes.source.push("DC1");
      lanes.target.push(`LOAD${i}`);
      lanes.distance_km.push(0);
      lanes.flow_units.push(0);
      data.health.node_ids.push(`LOAD${i}`);
      data.health.days_of_cover.push([...data.health.days_of_cover[8]]);
      data.health.stockout.push([...data.health.stockout[8]]);
      for (const matrix of [data.network.policy.reorder_point, data.network.policy.order_quantity])
        for (const row of matrix) row.push(0);
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page.getByTestId("network")).toHaveAttribute("data-node-count", "100");
  await page.evaluate(() => document.fonts.ready);
  let requests = 0;
  page.on("request", () => requests++);
  const samples = await page.evaluate(async () => {
    const slider = document.querySelector<HTMLInputElement>('input[aria-label="Simulation day"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const times: number[] = [];
    for (let day = 100; day < 140; day++) {
      const start = performance.now();
      setter.call(slider, String(day));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      times.push(performance.now() - start);
    }
    return {
      times,
      batches: performance
        .getEntriesByName("tower-health-update")
        .slice(-40)
        .map((entry) => entry.duration),
    };
  });
  const p95 = [...samples.times].sort((a, b) => a - b)[Math.floor(samples.times.length * 0.95)]!;
  const batchP95 = [...samples.batches].sort((a, b) => a - b)[
    Math.floor(samples.batches.length * 0.95)
  ]!;
  await testInfo.attach("scrubber-performance", {
    body: JSON.stringify({
      nodes: 100,
      ...samples,
      two_frame_p95_ms: p95,
      batch_p95_ms: batchP95,
      additional_requests: requests,
    }),
    contentType: "application/json",
  });
  expect(batchP95).toBeLessThan(16.7);
  expect(p95).toBeLessThan(100);
  expect(requests).toBe(0);
  await expect(page).toHaveURL(/day=139/);
});

test("live mode runs against the API and surfaces a failed request", async ({ page }) => {
  await page.goto("/?mode=live");
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByTestId("network")).toHaveAttribute("data-node-count", "36", {
    timeout: 60000,
  });
  await page.getByLabel("Inspect node", { exact: true }).selectOption("R01");
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(page.getByRole("dialog")).toContainText("SKU01");
  const skuResponse = page.waitForResponse(
    (response) =>
      response.url().includes("timeseries") &&
      response.url().includes("SKU02") &&
      response.status() === 200,
  );
  await page.getByLabel("Inspector SKU").selectOption("SKU02");
  await skuResponse;
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("button", { name: "Toggle paired deltas" }).click();
  await page.getByLabel("Baseline run ID").fill(new URL(page.url()).searchParams.get("run")!);
  await expect(page.getByLabel("CUSTOMER FILL RATE paired delta")).toHaveText("Δ B−A 0 pp");
  await page.route("**/api/runs", (route) =>
    route.fulfill({ status: 503, json: { detail: "Local run queue is full" } }),
  );
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByRole("alert", { name: "Study service error" })).toContainText(
    "Local run queue is full",
  );
  await page.getByRole("button", { name: "Methodology", exact: true }).click();
  await expect(page.getByTestId("study-ready")).toBeVisible();
  await expect(page.getByRole("alert", { name: "Study service error" })).toHaveCount(0);
});
