import { expect, test, type Page } from "@playwright/test";
import type { Core } from "cytoscape";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { BuilderRequest } from "../src/lib/builder";
import type { Schema } from "../src/lib/tower";

const reference = JSON.parse(
  readFileSync(new URL("../src/fixtures/builder.json", import.meta.url), "utf8"),
) as Schema["BuilderCatalog"];

async function canvasPoint(page: Page, id: string) {
  await page.getByTestId("builder-canvas").scrollIntoViewIfNeeded();
  return page.getByTestId("builder-canvas").evaluate((host, nodeId) => {
    const container = host.firstElementChild as HTMLElement & { _cyreg: { cy: Core } };
    const p = container._cyreg.cy.getElementById(nodeId).renderedPosition();
    const bounds = container.getBoundingClientRect();
    return { x: bounds.x + p.x, y: bounds.y + p.y };
  }, id);
}

test("visual model builder connects, drags, revises and simulates an imported custom network", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=builder");
  await expect(page).toHaveTitle("OpenSCM · Network builder");
  await expect(page.getByRole("heading", { name: "Validated engine topology" })).toBeVisible();
  const request = structuredClone(reference.request) as BuilderRequest;
  const spec = request.model.spec;
  spec.suppliers = spec.suppliers.slice(0, 1);
  spec.dcs = spec.dcs.slice(0, 3);
  spec.customers = spec.customers.slice(0, 2).map((row) => ({ ...row, region: 0 }));
  spec.skus = spec.skus.slice(0, 2).map((row) => ({ ...row, supplier: "S1" }));
  spec.open_dcs = ["DC1", "DC2", "DC3"];
  spec.assignments = { R01: "DC1", R02: "DC2" };
  request.overrides = {
    ...request.overrides,
    warmup_days: 7,
    horizon_days: 21,
    network: { dc_count: 3, suppliers: ["S1"] },
  };
  await page.getByRole("tab", { name: "Import / export", exact: true }).click();
  await page.getByLabel("Model import JSON").fill(
    JSON.stringify({
      format: "openscm-model-v1",
      name: "E6 teaching network",
      notes: "ASSUMPTION: custom classroom network",
      request,
    }),
  );
  await page.getByRole("button", { name: "Validate and import model" }).click();
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-node-count", "6");
  await expect(page.getByRole("heading", { name: "Validated engine topology" })).toBeVisible();
  await page.getByTestId("builder-canvas").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Connect DC → customer", exact: true }).click();
  let point = await canvasPoint(page, "DC3");
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByText("Source DC3: click the retailer or B2B buyer to reassign.", { exact: true }),
  ).toBeVisible();
  point = await canvasPoint(page, "R01");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel("Customer distribution centre")).toHaveValue("DC3");
  point = await canvasPoint(page, "DC3");
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 45, point.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.getByLabel("Selected identifier").fill("DC_CUSTOM");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("heading", { name: "DC_CUSTOM", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Lanes", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect model lane DC_CUSTOM to R01", exact: true })
    .click();
  await page.getByLabel("Lane distance_km").fill("17");
  await page.getByLabel("Lane lead_mean").fill("2");
  await page.getByLabel("Lane lead_cv").fill("0");
  await page.getByRole("tab", { name: "SKU master", exact: true }).click();
  await page.getByRole("button", { name: "Inspect model SKU SKU01", exact: true }).click();
  await page.getByLabel("SKU unit_cost", { exact: true }).fill("42");
  await page.getByRole("button", { name: "Save network model", exact: true }).click();
  await expect(page.getByText("Saved revision 1 on this server.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Facilities", exact: true }).click();
  await page.getByRole("button", { name: "Inspect model facility DC_CUSTOM", exact: true }).click();
  await page.getByLabel("Facility daily_capacity", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Save network model", exact: true }).click();
  await expect(page.getByText("Saved revision 2 on this server.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Model revision history").locator("option")).toHaveCount(3);
  await page.getByLabel("Model revision history").selectOption("1");
  await expect(page.getByLabel("Facility daily_capacity", { exact: true })).toHaveValue(
    String(spec.dcs[2]!.daily_capacity),
  );
  await page.getByLabel("Model revision history").selectOption("2");
  await expect(page.getByLabel("Facility daily_capacity", { exact: true })).toHaveValue("2000");
  await expect(page.getByRole("heading", { name: "Validated engine topology" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Interactive model canvas" })).toHaveScreenshot(
    "e6-custom-network.png",
    { maxDiffPixelRatio: 0.02 },
  );
  const response = page.waitForResponse(
    (value) =>
      value.request().method() === "POST" && /\/api\/portfolio\/[a-f0-9]+\/runs$/.test(value.url()),
  );
  await page.getByRole("button", { name: "Run saved network model", exact: true }).click();
  const execution = await (await response).json();
  await expect(page.getByTestId("builder-run-status").first()).toHaveText("complete", {
    timeout: 60000,
  });
  const provenance = await (
    await page.request.get(`/api/runs/${execution.status.run_id}/provenance`)
  ).json();
  expect(provenance.request.model.spec.assignments.R01).toBe("DC_CUSTOM");
  expect(provenance.request.model.spec.skus[0].unit_cost).toBe(42);
  expect(provenance.request.model.spec.dcs[2].latitude).toBe(spec.dcs[2]!.latitude);
  expect(provenance.request.model.positions.DC_CUSTOM).toBeDefined();
  expect(provenance.request.model.spec.lanes[0].distance_km).toBe(17);
  await testInfo.attach("network-builder", {
    body: JSON.stringify({ execution, provenance }),
    contentType: "application/json",
  });
  const imageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export network diagram PNG" }).click();
  const image = await readFile((await (await imageDownload).path())!);
  expect(image.subarray(1, 4).toString()).toBe("PNG");
  await page.reload();
  await expect(page.getByLabel("Model name", { exact: true })).toHaveValue("E6 teaching network");
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-node-count", "6");
  await page.getByRole("button", { name: "Open in Planning Lab", exact: true }).click();
  await expect(page.getByLabel("Scenario name", { exact: true })).toHaveValue(
    "E6 teaching network",
  );
  await expect(page.getByLabel("Open distribution centres", { exact: true })).toHaveValue("3");
  expect(errors).toEqual([]);
});

test("builder protects references, undoes edits and rejects invalid imports on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?view=builder");
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-node-count", "40");
  await page.getByRole("button", { name: "Supplier", exact: true }).click();
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-node-count", "41");
  await page.getByRole("button", { name: "Undo model edit" }).click();
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-node-count", "40");
  await page.getByRole("button", { name: "Redo model edit" }).click();
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-node-count", "41");
  await page.getByRole("button", { name: "Inspect model facility S1", exact: true }).click();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Builder workspace error" })).toContainText(
    "Reassign every SKU",
  );
  await page.getByRole("tab", { name: "Import / export", exact: true }).click();
  await page.getByLabel("Model import JSON").fill('{"model":{"format_version":9}}');
  await page.getByRole("button", { name: "Validate and import model" }).click();
  await expect(page.getByRole("alert", { name: "Builder workspace error" })).toContainText(
    "Invalid request",
  );
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-node-count", "41");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
