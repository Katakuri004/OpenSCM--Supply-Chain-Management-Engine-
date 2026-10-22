import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("student predicts, runs paired conditions, explores daily evidence and exports a notebook", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=learning&lesson=forecast");
  await expect(page).toHaveTitle("OpenSCM · Learning sandbox");
  await expect(page.getByLabel("Guided experiment", { exact: true }).locator("option")).toHaveCount(
    10,
  );
  await expect(
    page.getByRole("button", { name: "Run learning experiment", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save B in Planning Lab" })).toBeEnabled();
  await expect(page).toHaveScreenshot("e3-learning-workspace.png", { maxDiffPixelRatio: 0.02 });
  await page
    .getByLabel("Student prediction")
    .fill(
      "A shorter forecast window may respond faster but amplify noise; compare intervals before deciding.",
    );
  await page.getByText("Customise A and B assumptions", { exact: true }).click();
  await page.getByLabel("Edit learning condition").selectOption("a");
  await page.getByLabel("Warm-up days", { exact: true }).fill("7");
  await page.getByLabel("Measured days", { exact: true }).fill("21");
  await page.getByRole("button", { name: "Match B experiment window to A" }).click();
  await page.getByText("Customise A and B assumptions", { exact: true }).click();
  await page.getByRole("button", { name: "Run learning experiment", exact: true }).click();
  const results = page.getByTestId("learning-results");
  await expect(results).toBeVisible({ timeout: 60000 });
  const a = await results.getAttribute("data-run-a"),
    b = await results.getAttribute("data-run-b");
  const comparison = await (await page.request.get(`/api/compare?a=${a}&b=${b}`)).json();
  await expect(page.getByTestId("learning-delta-total_landed_cost_inr")).toHaveAttribute(
    "data-value",
    String(comparison.metrics.total_landed_cost_inr.mean),
  );
  await expect(page.getByRole("table", { name: "Learning experiment results" })).toHaveScreenshot(
    "e3-student-results.png",
    { maxDiffPixelRatio: 0.02 },
  );
  await page
    .getByLabel("Student reflection")
    .fill(
      "The paired interval is evidence about this synthetic model; I would validate demand and transit assumptions before real use.",
    );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notebook & evidence" }).click();
  const evidence = JSON.parse(await readFile((await (await downloadEvent).path())!, "utf8"));
  expect(evidence.result.provenance).toHaveLength(2);
  expect(evidence.result.comparison).toEqual(comparison);
  expect(evidence.submitted.requests[0].overrides.horizon_days).toBe(21);
  expect(evidence.notebook.reflection).toContain("paired interval");
  await testInfo.attach("student-experiment", {
    body: JSON.stringify(evidence),
    contentType: "application/json",
  });
  await page.getByLabel("Paired root seed").fill("223");
  await expect(
    page.getByText(
      "Inputs changed. Results below belong to the submitted snapshots; run again to evaluate your current draft.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore daily A/B evidence" }).click();
  await page.getByLabel("Explorer source").selectOption("b");
  await expect(page.getByLabel("Explorer SKU").locator("option")).toHaveCount(20);
  await page.getByLabel("Explorer metric", { exact: true }).selectOption("forecast");
  await expect(page.getByRole("region", { name: "Pre-demand forecast · line" })).toBeVisible();
  await page.getByLabel("Explorer chart").selectOption("scatter");
  await page.getByLabel("Explorer X metric").selectOption("demand");
  await expect(page.getByRole("region", { name: "Pre-demand forecast · scatter" })).toBeVisible();
  await page.getByLabel("Explorer SKU").selectOption("SKU02");
  await page.getByLabel("Explorer facility").selectOption("R02");
  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Pre-demand forecast · scatter CSV" }).click();
  const csv = await readFile((await (await csvEvent).path())!, "utf8");
  expect(csv).toContain("forecast");
  expect(csv).toContain("demand");
  await page.getByLabel("Explorer from day").fill("22");
  await page.getByLabel("Explorer through day").fill("20");
  await expect(page.getByText("Choose ordered whole days between 0 and 27.")).toBeVisible();
  await page.getByRole("button", { name: "Measured window", exact: true }).click();
  await page.getByLabel("Explorer chart").selectOption("distribution");
  await expect(page.getByTestId("learning-explorer")).toHaveScreenshot("e3-visual-explorer.png", {
    maxDiffPixelRatio: 0.02,
  });
  await page.getByRole("tab", { name: "Guided experiments" }).click();
  await page.reload();
  await expect(page.getByLabel("Student prediction")).toHaveValue(/shorter forecast/);
  await expect(page.getByLabel("Student reflection")).toHaveValue(/paired interval/);
  await page.getByRole("button", { name: "Save B in Planning Lab" }).click();
  await expect(page.getByLabel("Scenario name", { exact: true })).toHaveValue(
    "Learning: Forecast responsiveness",
  );
  expect(errors).toEqual([]);
});

test("student reference and recorded explorer remain usable without simulation API on narrow screens", async ({
  page,
}) => {
  await page.route("**/api/lab", (route) =>
    route.fulfill({ status: 503, json: { detail: "Simulation API offline" } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?view=learning");
  await expect(page.getByRole("alert", { name: "Learning API error" })).toContainText(
    "Simulation API offline",
    { timeout: 15000 },
  );
  await page.getByRole("tab", { name: "Guided experiments" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("heading", { name: "Inside one simulation day" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Concept reference" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByLabel("Explorer facility")).toBeVisible();
  await page.getByLabel("Explorer chart").selectOption("bar");
  await expect(page.getByRole("region", { name: "Closing on-hand · bar" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("Explorer source").selectOption("custom");
  await page.getByLabel("Explorer run ID").fill("f".repeat(64));
  await page.getByRole("button", { name: "Load run evidence" }).click();
  await expect(page.getByRole("alert", { name: "Explorer error" })).toBeVisible({ timeout: 15000 });
});
