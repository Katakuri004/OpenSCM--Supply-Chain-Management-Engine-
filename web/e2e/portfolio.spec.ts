import { test, expect } from "@playwright/test";

test("planning portfolio persists configurations, runs alternatives and explains the results", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=portfolio");
  await page.getByRole("button", { name: "New scenario", exact: true }).click();
  await expect(page.getByLabel("Scenario name", { exact: true })).toBeVisible();
  await expect(page.getByTestId("portfolio-editor")).toHaveScreenshot("e2-lab-editor.png", {
    maxDiffPixelRatio: 0.02,
  });
  await page.getByLabel("Scenario name", { exact: true }).fill("E2 replenishment baseline");
  await page
    .getByLabel("Planning notes")
    .fill("Synthetic exercise; verify service before increasing capacity.");
  await page.getByLabel("Warm-up days", { exact: true }).fill("7");
  await page.getByLabel("Measured days", { exact: true }).fill("21");
  await page.getByLabel("Replications", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Save scenario", exact: true }).click();
  await expect(page.getByTestId("portfolio-revision")).toHaveText("Revision 1");
  await page.getByRole("button", { name: "Run saved scenario", exact: true }).click();
  await expect(page.getByTestId("latest-run-status")).toHaveText("complete", { timeout: 60000 });
  await page.getByRole("button", { name: "Use latest run as baseline A" }).click();
  await page
    .getByLabel("Scenario name", { exact: true })
    .fill("E2 capacity and buffer alternative");
  await page.getByLabel("DC capacity factor").fill("0.5");
  await page.getByLabel("Safety buffer days").fill("2");
  await page.getByLabel("Forecast mode").selectOption("forecast");
  await page.getByLabel("January demand index").fill("1.1");
  await page.getByRole("button", { name: "Save as new scenario", exact: true }).click();
  await page.getByRole("button", { name: "Run saved scenario", exact: true }).click();
  await expect(page.getByTestId("latest-run-status")).toHaveText("complete", { timeout: 60000 });
  await page.getByRole("button", { name: "Compare selected runs", exact: true }).click();
  const comparison = page.getByTestId("portfolio-comparison");
  await expect(comparison).toBeVisible();
  const a = await comparison.getAttribute("data-run-a");
  const b = await comparison.getAttribute("data-run-b");
  const response = await page.request.get(`/api/compare?a=${a}&b=${b}`);
  const data = await response.json();
  expect(response.ok()).toBe(true);
  await expect(page.getByTestId("portfolio-cost-delta")).toHaveAttribute(
    "data-value",
    String(data.metrics.total_landed_cost_inr.mean),
  );
  await expect(page.getByRole("table", { name: "SKU shortage contributors" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Facility cost and capacity" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Lane freight contributors" })).toBeVisible();
  await expect(page.getByTestId("portfolio-comparison")).toHaveScreenshot("e2-comparison.png", {
    maxDiffPixelRatio: 0.02,
  });
  await expect(page.getByRole("region", { name: "Run diagnostics" })).toHaveScreenshot(
    "e2-run-diagnostics.png",
    { maxDiffPixelRatio: 0.02 },
  );
  const diagnostics = await (await page.request.get(`/api/runs/${b}/diagnostics`)).json();
  const provenance = await (await page.request.get(`/api/runs/${b}/provenance`)).json();
  await testInfo.attach("planning-portfolio", {
    body: JSON.stringify({ comparison: data, diagnostics, provenance }),
    contentType: "application/json",
  });
  await page.reload();
  await expect(page.getByLabel("Scenario name", { exact: true })).toHaveValue(
    "E2 capacity and buffer alternative",
  );
  await expect(page.getByLabel("Safety buffer days")).toHaveValue("2");
  await page.route("**/api/portfolio", (route) =>
    route.fulfill({ status: 503, json: { detail: "Workspace temporarily unavailable" } }),
  );
  await page.getByRole("button", { name: "Reload saved revision" }).click();
  await expect(page.getByRole("alert", { name: "Planning lab error" })).toContainText(
    "Workspace temporarily unavailable",
  );
  expect(errors).toEqual([]);
});
