import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("decision case preserves a complete investigation and carries its evidence across tools", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Decision cases", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start decision case", exact: true }).click();
  await page.getByLabel("Case name", { exact: true }).fill("Dispatch capacity decision");
  await page
    .getByLabel("Prediction before running")
    .fill("Reduced dispatch capacity may constrain receipts even with adequate inventory.");
  await page.getByRole("tab", { name: /Alternatives/ }).click();
  await page.getByLabel("Warm-up days", { exact: true }).fill("7");
  await page.getByLabel("Measured days", { exact: true }).fill("21");
  await expect(page.getByRole("button", { name: "Run saved comparison" })).toBeDisabled();
  await page.getByRole("button", { name: "Save case", exact: true }).click();
  await expect(page.getByText(/Saved r2/)).toBeVisible();
  await page.getByRole("button", { name: "Run saved comparison" }).click();
  const results = page.getByTestId("learning-results");
  await expect(results).toBeVisible({ timeout: 60000 });
  const a = await results.getAttribute("data-run-a"),
    b = await results.getAttribute("data-run-b");
  const comparison = await (await page.request.get(`/api/compare?a=${a}&b=${b}`)).json();
  await expect(page.getByTestId("learning-delta-total_landed_cost_inr")).toHaveAttribute(
    "data-value",
    String(comparison.metrics.total_landed_cost_inr.mean),
  );
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export saved case" }).click();
  const payload = JSON.parse(await readFile((await (await exported).path())!, "utf8"));
  expect(payload.evidence.execution.snapshot.prediction).toContain("Reduced dispatch");
  expect(payload.evidence.comparison).toEqual(comparison);
  expect(payload.definition.alternative.overrides.horizon_days).toBe(21);
  await testInfo.attach("decision-case", {
    body: JSON.stringify(payload),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "Inspect condition B in Control Tower" }).click();
  await expect(page.getByRole("heading", { name: "Control Tower", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active decision case" })).toBeVisible();
  await expect(page).toHaveURL(/caseRun=/);
  await page.getByRole("button", { name: "Return to case" }).click();
  await page.getByRole("tab", { name: /Decision/ }).click();
  await page
    .getByLabel("Decision and next validation")
    .fill("Retest dispatch mitigation on independent seeds before recommending a plan.");
  await page.reload();
  await page.getByRole("button", { name: "Recover draft" }).click();
  await page.getByRole("tab", { name: /Decision/ }).click();
  await expect(page.getByLabel("Decision and next validation")).toHaveValue(/independent seeds/);
  await page.getByRole("button", { name: "Save case", exact: true }).click();
  await expect(page.getByText(/Saved r3/)).toBeVisible();
  await page.getByRole("tab", { name: /Evidence/ }).click();
  await expect(page.getByText(/Showing evidence snapshot r2; current editor r3/)).toBeVisible();
  await page.screenshot({ path: "e2e/snapshots/e4-decision-case.png", fullPage: true });
  await page.getByRole("button", { name: "Case library", exact: true }).click();
  await page.getByText("Import a portable decision case", { exact: true }).click();
  await page.getByLabel("Case package JSON").fill(JSON.stringify(payload));
  await page.getByRole("button", { name: "Import as new case" }).click();
  await page.getByRole("tab", { name: /Evidence/ }).click();
  await page.getByLabel("Case execution", { exact: true }).selectOption("imported");
  await expect(page.getByText(/Imported evidence is not locally verified/)).toBeVisible();
  await expect(results).toBeVisible();
  expect(errors).toEqual([]);
});

test("case conflicts retain the draft; keyboard navigation and offline library remain clear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start decision case", exact: true }).click();
  await expect(page.getByLabel("Case name", { exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("case");
  const detail = await (await page.request.get(`/api/cases/${id}`)).json();
  const { id: _id, created_at: _created, updated_at: _updated, ...change } = detail.case;
  expect(
    (
      await page.request.put(`/api/cases/${id}`, {
        data: { ...change, question: "Changed in another window" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByLabel("Case name", { exact: true }).fill("Keep this unsaved work");
  await page.getByRole("button", { name: "Save case", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Case workspace error" })).toContainText(
    "Case changed",
  );
  await expect(page.getByLabel("Case name", { exact: true })).toHaveValue("Keep this unsaved work");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export draft", exact: true }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, "utf8")).definition.name).toBe(
    "Keep this unsaved work",
  );
  await page.getByRole("button", { name: "Discard draft and reload saved case" }).click();
  await expect(page.getByLabel("Operating question", { exact: true })).toHaveValue(
    "Changed in another window",
  );
  await page.getByRole("tab", { name: /Brief/ }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Decision/ })).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.route("**/api/cases", (route) =>
    route.fulfill({ status: 503, json: { detail: "Case API offline" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert", { name: "Case service error" })).toContainText(
    "Case API offline",
    { timeout: 15000 },
  );
  await expect(page.getByRole("button", { name: "Explore learning examples" })).toBeVisible();
});

test("learning handoff retains both conditions, notebook and matching evidence", async ({
  page,
}) => {
  await page.goto("/?view=learning&lesson=capacity");
  await page
    .getByLabel("Student prediction")
    .fill("Dispatch is the bottleneck; inspect customer receipts.");
  await page.getByText("Customise A and B assumptions", { exact: true }).click();
  await page.getByLabel("Edit learning condition").selectOption("a");
  await page.getByLabel("Warm-up days", { exact: true }).fill("7");
  await page.getByLabel("Measured days", { exact: true }).fill("21");
  await page.getByRole("button", { name: "Match B experiment window to A" }).click();
  await page.getByText("Customise A and B assumptions", { exact: true }).click();
  await page.getByRole("button", { name: "Run learning experiment", exact: true }).click();
  await expect(page.getByTestId("learning-results")).toBeVisible({ timeout: 60000 });
  await page
    .getByLabel("Student reflection")
    .fill("Distinguish the paired estimate from the first replication trace.");
  await page.getByRole("button", { name: "Save full decision case" }).click();
  await expect(page.getByLabel("Prediction before running")).toHaveValue(
    /Dispatch is the bottleneck/,
  );
  await page.getByRole("tab", { name: /Evidence/ }).click();
  await expect(
    page
      .getByLabel("Case execution", { exact: true })
      .locator("option")
      .filter({ hasText: "Attached" }),
  ).toHaveCount(1);
  await expect(page.getByTestId("learning-results")).toBeVisible();
  await page.getByRole("tab", { name: /Alternatives/ }).click();
  await page.getByRole("button", { name: "Open network builder" }).click();
  await page.getByRole("button", { name: "Load saved case condition B" }).click();
  await page.getByRole("button", { name: "Use as case condition B" }).click();
  await expect(page.getByLabel("Prediction before running")).toHaveValue(
    /Dispatch is the bottleneck/,
  );
  await expect(page.getByText(/Saved r2/)).toBeVisible();
  await page.getByRole("tab", { name: /Alternatives/ }).click();
  await page
    .getByText("Full condition JSON · model and advanced assumptions", { exact: true })
    .click();
  const condition = JSON.parse(
    await page.getByLabel("Condition JSON", { exact: true }).inputValue(),
  );
  expect(condition.model.spec.dcs.length).toBeGreaterThan(0);
  expect(condition.lab.dc_capacity_factor).toBe(0.35);
});
