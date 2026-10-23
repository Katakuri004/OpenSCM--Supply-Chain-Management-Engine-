import { test, expect } from "@playwright/test";

test("operations overview reconciles to recorded health and opens actionable exceptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fixture = await (await page.request.get("/fixtures/tower.json")).json();
  await page.goto("/?view=overview");
  await expect(
    page.getByRole("heading", { name: "Operations overview", exact: true }),
  ).toBeVisible();
  const day = 120;
  await page.getByLabel("Observation day", { exact: true }).fill(String(day));
  const column = fixture.health.days.indexOf(day);
  const ids = fixture.network.network.nodes.id;
  const types = fixture.network.network.nodes.type;
  const expected = fixture.health.node_ids.filter(
    (id: string, row: number) =>
      types[ids.indexOf(id)] !== "supplier" && fixture.health.stockout[row][column],
  ).length;
  await expect(page.getByTestId("stockout-site-count")).toHaveText(String(expected));
  await expect(page).toHaveScreenshot("e1-overview.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
  await page.getByRole("button", { name: "Open exception workbench" }).click();
  await expect(page.getByRole("table", { name: "Operational exceptions" })).toBeVisible();
  await expect(page).toHaveScreenshot("e1-exceptions.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
  const first = page.getByRole("button", { name: /^Mark .* reviewed$/ }).first();
  const label = await first.getAttribute("aria-label");
  await first.click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: label!.replace("Mark ", "Reopen ").replace(" reviewed", "") }),
  ).toBeVisible();
  await page.getByLabel("Review state", { exact: true }).selectOption("reviewed");
  await expect(
    page.getByRole("table", { name: "Operational exceptions" }).locator("tbody tr"),
  ).toHaveCount(1);
  await page.getByLabel("Observation day", { exact: true }).fill("121");
  await expect(page.getByText("No exceptions match these filters.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("operational playbooks load explicit combined events and command search is keyboard accessible", async ({
  page,
}, testInfo) => {
  await page.goto("/?view=playbooks");
  await expect(page.getByRole("heading", { name: /Real operating questions/ })).toBeVisible();
  await expect(page).toHaveScreenshot("e1-playbooks.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
  await page
    .getByRole("button", { name: "Configure Demand surge with constrained distribution" })
    .click();
  await expect(page).toHaveURL(/playbook=demand-surge/);
  await expect(page.getByLabel("demand shock", { exact: true })).toHaveValue("1.8");
  await expect(page.getByLabel("capacity cut", { exact: true })).toHaveValue("0.25");
  await expect(
    page.getByText("Demand surge with constrained distribution", { exact: true }),
  ).toBeVisible();
  const requests: {
    options: { forecasting: boolean; lost_sales: boolean };
    overrides: { policy: { default: string }; disruptions: { type: string; magnitude: number }[] };
  }[] = [];
  await page.getByLabel("Replenishment policy").selectOption("RS");
  await page.getByLabel("Planning assumptions").selectOption("forecast");
  await page.getByLabel("Unfilled demand").selectOption("lost_sales");
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/runs"))
      requests.push(request.postDataJSON());
  });
  await page.getByRole("button", { name: "Run paired scenarios" }).click();
  await expect(page.getByTestId("scenario-pair")).toHaveAttribute("data-ready", "true", {
    timeout: 60000,
  });
  await page.getByLabel("Event duration").fill("14");
  await expect(page.getByText(/Inputs changed. Results below retain/)).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]!.options).toMatchObject({ forecasting: true, lost_sales: true });
  expect(requests[1]!.overrides.policy.default).toBe("RS");
  expect(requests[0]!.overrides.disruptions).toEqual([]);
  expect(requests[1]!.overrides.disruptions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "demand_shock", magnitude: 1.8 }),
      expect.objectContaining({ type: "capacity_cut", magnitude: 0.25 }),
    ]),
  );
  const pair = page.getByTestId("scenario-pair");
  const runA = await pair.getAttribute("data-run-a");
  const runB = await pair.getAttribute("data-run-b");
  const comparison = await page.request.get(`/api/compare?a=${runA}&b=${runB}`);
  expect(comparison.ok()).toBe(true);
  await testInfo.attach("operating-playbook", {
    body: JSON.stringify({
      playbook: "demand-surge",
      requests,
      comparison: await comparison.json(),
    }),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "Inspect scenario B in Control Tower" }).click();
  await expect(page.getByTestId("network")).toHaveAttribute("data-node-count", "36");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search workspace" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("inventory");
  await dialog.getByRole("button", { name: /Inventory Lab/ }).click();
  await expect(page.getByRole("heading", { name: "Inventory Lab", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog", { name: "Workspace navigation" })
    .getByRole("button", { name: "Operations overview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Operations overview", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
