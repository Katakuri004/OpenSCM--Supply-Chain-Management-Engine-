import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const views = [
  ["scenario", "Scenario Lab"],
  ["network", "Network Design"],
  ["bullwhip", "Bullwhip Lab"],
  ["inventory", "Inventory Lab"],
  ["resilience", "Resilience"],
  ["methodology", "Methodology"],
] as const;
for (const [view, title] of views)
  test(`${title} loads recorded evidence`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?view=${view}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByTestId("study-ready")).toBeVisible();
    await expect(page).toHaveScreenshot(`m10-${view}.png`, {
      fullPage: true,
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
    expect(errors).toEqual([]);
  });

test("Scenario Lab paired deltas match the live API", async ({ page }) => {
  await page.goto("/?view=scenario&mode=live");
  // Exercise a disruption, rather than only rerunning the neutral recorded pair.
  await page.getByLabel("demand shock", { exact: true }).focus();
  await page.getByLabel("demand shock", { exact: true }).press("ArrowRight");
  await page.getByRole("button", { name: "Run paired scenarios" }).click();
  const pair = page.getByTestId("scenario-pair");
  await expect(pair).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  const a = await pair.getAttribute("data-run-a");
  const b = await pair.getAttribute("data-run-b");
  const response = await page.request.get(`/api/compare?a=${a}&b=${b}`);
  expect(response.ok()).toBe(true);
  const comparison = await response.json();
  await expect(page.getByTestId("paired-fill-delta")).toHaveAttribute(
    "data-value",
    String(comparison.metrics.fill_rate.mean),
  );
  await expect(page.getByTestId("paired-cost-delta")).toHaveAttribute(
    "data-value",
    String(comparison.metrics.total_landed_cost_inr.mean),
  );
  await expect(page.getByTestId("paired-fill-delta")).toHaveText(
    `${(comparison.metrics.fill_rate.mean * 100).toFixed(4)} pp`,
  );
});

test("study controls select saved cases and export the displayed evidence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const evidence = await (await page.request.get("/fixtures/studies.json")).json();
  await page.goto("/?view=bullwhip");
  await page.getByLabel("batching", { exact: true }).check();
  await page.getByLabel("Bullwhip lead factor").selectOption("0.5");
  const selected = evidence.experiments.E4.cases.find(
    (row: { factors: Record<string, unknown> }) =>
      row.factors.batching === true &&
      row.factors.lead_factor === 0.5 &&
      ["signal_processing", "price", "rationing", "pos_sharing"].every(
        (flag) => !row.factors[flag],
      ),
  );
  const weekly = page.getByRole("region", { name: "Weekly bullwhip by echelon" });
  await expect(weekly).toContainText(selected.case_id);
  const csvDownload = page.waitForEvent("download");
  await weekly.getByRole("button", { name: /CSV/ }).click();
  const csv = await readFile((await (await csvDownload).path())!, "utf8");
  const expected = evidence.experiments.E4.estimates.find(
    (row: { case_id: string; metric: string }) =>
      row.case_id === selected.case_id && row.metric === "bwe_dc_orders",
  );
  expect(csv).toContain(`DC orders,${expected.mean},`);

  await page.getByRole("button", { name: "Inventory Lab", exact: true }).click();
  const quantity = page.getByLabel("Analytical order quantity");
  await quantity.focus();
  await quantity.press("End");
  await expect(page.getByText(/Q 200 · Q\* 100 · cost INR 912.5/)).toBeVisible();
  await page.getByLabel("Service curve SKU").selectOption("SKU15");
  await expect(
    page.getByRole("region", { name: "Achieved service versus inventory cost" }),
  ).toContainText("SKU15");

  await page.getByRole("button", { name: "Network Design", exact: true }).click();
  await page.getByLabel("Demand CV", { exact: true }).selectOption("0.8");
  await page.getByLabel("Placement DC count").selectOption("8");
  await page.getByLabel("Latitude/longitude").check();
  await expect(page.getByLabel("Latitude/longitude")).toBeChecked();
  await page.getByRole("button", { name: "Resilience", exact: true }).click();
  await page.getByLabel("Resilience event").selectOption("1");
  await page.getByLabel("Sensitivity mitigation").selectOption("stock_buffer");
  await expect(
    page.getByRole("region", { name: "Affected-customer service through the disruption" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Methodology", exact: true }).click();
  await page.getByLabel("Find assumption").fill("holding");
  await expect(page.getByRole("cell", { name: "Customer annual holding rate" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "seed", exact: true })).toHaveCount(0);
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download validation report/ }).click();
  expect((await reportDownload).suggestedFilename()).toBe("validation.md");
  expect((await page.request.get("/reference/private")).status()).toBe(404);
  expect(errors).toEqual([]);
});
