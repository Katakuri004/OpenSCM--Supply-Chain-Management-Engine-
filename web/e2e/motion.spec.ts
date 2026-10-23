import { expect, test, type Locator } from "@playwright/test";
import type { Core } from "cytoscape";

async function viewportState(canvas: Locator) {
  return canvas.evaluate((host) => {
    const container = host.firstElementChild as HTMLElement & { _cyreg: { cy: Core } };
    const cy = container._cyreg.cy;
    const point = cy.getElementById("R01").renderedPosition();
    const bounds = container.getBoundingClientRect();
    return {
      animated: cy.animated(),
      transition: cy.nodes().first().style("transition-duration") as string,
      related: cy.edges(".related").length,
      x: bounds.x + point.x,
      y: bounds.y + point.y,
    };
  });
}

async function duration(control: Locator, property = "transitionDuration") {
  return control.evaluate(
    (element, key) =>
      Math.max(...getComputedStyle(element).getPropertyValue(key).split(",").map(parseFloat)),
    property === "transitionDuration" ? "transition-duration" : "animation-duration",
  );
}

test("motion polish preserves actual saves, keyboard sections and deliberate canvas actions", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=builder");
  await expect(page.getByRole("heading", { name: "Validated engine topology" })).toBeVisible();
  const canvas = page.getByTestId("builder-canvas");
  await expect(canvas).toHaveAttribute("data-motion", "full");
  expect((await viewportState(canvas)).transition).toBe("120ms");
  const save = page.getByRole("button", { name: "Save network model", exact: true });
  expect(await duration(save)).toBeGreaterThan(0);
  await save.hover();
  await expect.poll(() => save.evaluate((el) => getComputedStyle(el).transform)).not.toBe("none");
  await page.getByLabel("Model name", { exact: true }).fill("E9 interaction study");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "POST") await pending;
    await route.continue();
  });
  await save.click();
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(save).toBeDisabled();
  await expect(save.locator(".motion-spinner")).toBeVisible();
  release();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved revision 1 on this server." }),
  ).toBeVisible();
  await expect(save).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel("Model name", { exact: true })).toHaveValue("E9 interaction study");

  const tabs = page.getByRole("tablist", { name: "Builder data sections" });
  await tabs.getByRole("tab", { name: "Facilities", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "SKU master" })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "SKU master" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Import / export" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.getByRole("tab", { name: "Import / export" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Facilities", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Inspect model facility R01", exact: true }).click();
  await expect(page.getByTestId("builder-inspector-transition")).toHaveAttribute(
    "data-selection",
    "R01",
  );
  await expect(page.getByLabel("Selected identifier", { exact: true })).toHaveValue("R01");
  await canvas.scrollIntoViewIfNeeded();
  const zoom = page.getByLabel("Canvas zoom", { exact: true });
  const before = parseInt((await zoom.textContent())!);
  await page.getByRole("button", { name: "Zoom model in", exact: true }).click();
  await expect.poll(async () => parseInt((await zoom.textContent())!)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Fit model canvas", exact: true }).click();
  await expect
    .poll(async () => parseInt((await zoom.textContent())!))
    .toBeLessThanOrEqual(before + 1);
  await expect.poll(async () => (await viewportState(canvas)).animated).toBe(false);
  const point = await viewportState(canvas);
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => (await viewportState(canvas)).related).toBeGreaterThan(0);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await viewportState(canvas)).related).toBe(0);
  // Repeated actions interrupt the viewport animation instead of queuing a long flight.
  await page.getByRole("button", { name: "Zoom model in", exact: true }).click({ clickCount: 3 });
  await page.getByRole("button", { name: "Fit model canvas", exact: true }).click();
  await expect
    .poll(async () => parseInt((await zoom.textContent())!))
    .toBeLessThanOrEqual(before + 1);
  await expect(page.getByRole("region", { name: "Interactive model canvas" })).toHaveScreenshot(
    "e9-builder-polish.png",
    { maxDiffPixelRatio: 0.02 },
  );
  await testInfo.attach("interaction-motion", {
    body: JSON.stringify({
      device: "no-preference",
      actual_save: true,
      keyboard_sections: true,
      viewport_actions: true,
    }),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("device and saved reduced motion disable CSS and canvas movement without losing focus or drafts", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?view=builder");
  const canvas = page.getByTestId("builder-canvas");
  await expect(canvas).toHaveAttribute("data-motion", "reduced");
  await page.getByLabel("Model name", { exact: true }).fill("Motion preference draft");
  const settings = page.getByRole("button", { name: "Motion preferences", exact: true });
  expect(await duration(settings)).toBe(0);
  await settings.click();
  let dialog = page.getByRole("dialog", { name: "Motion preferences", exact: true });
  expect(await duration(dialog, "animationDuration")).toBe(0);
  await dialog.getByRole("radio", { name: "Reduce motion", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(page.getByLabel("Model name", { exact: true })).toHaveValue(
    "Motion preference draft",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await expect(canvas).toHaveAttribute("data-motion", "reduced");
  await settings.click();
  dialog = page.getByRole("dialog", { name: "Motion preferences", exact: true });
  await dialog.getByRole("radio", { name: "Follow device", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-motion", "full");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-motion", "reduced");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Zoom model in", exact: true }).click();
  expect((await viewportState(canvas)).animated).toBe(false);
  expect((await viewportState(canvas)).transition).toBe("0ms");
  await expect(page.getByLabel("Canvas zoom", { exact: true })).toHaveText(/\d+%/);
  await expect(
    page.getByRole("button", { name: "Run saved network model", exact: true }),
  ).toBeDisabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(canvas).toHaveAttribute("data-motion", "full");
  const peer = await page.context().newPage();
  await peer.goto("/?view=builder");
  await peer.getByRole("button", { name: "Motion preferences", exact: true }).click();
  await peer.getByRole("radio", { name: "Reduce motion", exact: true }).check();
  await expect(canvas).toHaveAttribute("data-motion", "reduced");
  await peer.close();
});

test("reduced motion still applies when browser storage rejects the preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "scm-motion-preference")
        throw new DOMException("Storage is full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto("/?view=builder");
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-motion", "full");
  await page.getByRole("button", { name: "Motion preferences", exact: true }).click();
  await page.getByRole("radio", { name: "Reduce motion", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Reduce motion", exact: true })).toBeChecked();
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-motion", "reduced");
  await page.getByRole("radio", { name: "Follow device", exact: true }).check();
  await expect(page.getByTestId("builder-canvas")).toHaveAttribute("data-motion", "full");
});

test("animated search, inspector and mobile navigation restore keyboard focus and fit narrow dark screens", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?view=tower");
  await page.getByLabel("Inspect node", { exact: true }).selectOption("R01");
  const inspector = page.getByRole("button", { name: "Open inspector", exact: true });
  await inspector.click();
  expect(await duration(page.getByRole("dialog"), "animationDuration")).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(inspector).toBeFocused();
  const search = page.getByRole("button", { name: "Search workspace", exact: true });
  await search.focus();
  await page.keyboard.press("Control+k");
  expect(await duration(page.getByRole("dialog"), "animationDuration")).toBeGreaterThan(0);
  await page.getByLabel("Search modules and facilities").fill("builder");
  await page.getByRole("button", { name: "Network builder Module" }).click();
  await expect(page.getByRole("heading", { name: "Network builder", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
  expect(await duration(dialog, "animationDuration")).toBeGreaterThan(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await page.getByRole("button", { name: "Motion preferences", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Motion preferences", exact: true })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Motion preferences", exact: true }),
  ).toHaveScreenshot("e9-motion-dark-mobile.png", { maxDiffPixelRatio: 0.02 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
