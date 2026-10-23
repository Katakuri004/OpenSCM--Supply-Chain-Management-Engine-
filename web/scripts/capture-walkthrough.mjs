import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";
import assert from "node:assert/strict";

// The documentation API must use its own SCM_RUN_ROOT; never capture into a user's portfolio.
const base = process.env.SCM_WALKTHROUGH_URL || "http://127.0.0.1:5173";
const apiBase = process.env.SCM_WALKTHROUGH_API || "http://127.0.0.1:8001";
assert.notEqual(new URL(apiBase).port, "8000", "Use a separate documentation API on port 8001");
const root = resolve("..");
const folder = "docs/images/walkthrough";
await mkdir(resolve(root, folder), { recursive: true });
const digest = (data) => createHash("sha256").update(data).digest("hex");
const captures = [],
  evidence = [];
const modules = [
  "overview",
  "exceptions",
  "tower",
  "playbooks",
  "portfolio",
  "learning",
  "scenario",
  "network",
  "builder",
  "inventory",
  "bullwhip",
  "resilience",
  "methodology",
];
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(20000);
// Forward to a real, isolated engine; do not fabricate API or chart responses.
await page.route("**/api/**", async (route) => {
  const original = new URL(route.request().url());
  const response = await route.fetch({
    url: `${apiBase}${original.pathname.slice(4)}${original.search}`,
    timeout: 120000,
  });
  await route.fulfill({ response });
});
async function api(path, body) {
  const response = await context.request.fetch(
    `${apiBase}${path}`,
    body ? { method: "POST", data: body } : {},
  );
  assert(response.ok(), `${response.status()} ${path}: ${await response.text()}`);
  return response.json();
}
async function open(view, query = "") {
  await page.goto(`${base}/?view=${view}&mode=fixture&day=120${query}`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("h1")).toBeVisible();
}
async function saveEvidence(name, value) {
  const file = `${folder}/${name}.json`;
  await writeFile(resolve(root, file), JSON.stringify(value, null, 2) + "\n");
  evidence.push(file);
}
async function capture(name, module, source, target = page, fullPage = false) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  await page.mouse.move(0, 0);
  const file = `${folder}/${name}.png`;
  const bytes = await target.screenshot({
    path: resolve(root, file),
    animations: "disabled",
    ...(target === page ? { fullPage } : {}),
  });
  captures.push({
    file,
    module,
    source,
    route: new URL(page.url()).search,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: digest(bytes),
  });
  console.log(`Captured ${name}`);
}
try {
  await open("overview");
  await expect(page.getByTestId("stockout-site-count")).toBeVisible();
  await capture("operations-overview", "overview", "recorded");
  await open("exceptions");
  await expect(page.getByRole("table", { name: "Operational exceptions" })).toBeVisible();
  await capture("exception-workbench", "exceptions", "recorded");
  await open("tower");
  await expect(page.getByTestId("network")).toHaveAttribute("data-node-count", "36");
  await capture("control-tower", "tower", "recorded");
  await page.getByLabel("Inspect node", { exact: true }).selectOption("R01");
  await page.getByRole("button", { name: "Open inspector", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Delhi north retail" })).toBeVisible();
  await capture("facility-inspector", "tower", "recorded", page.getByRole("dialog"));
  await page.getByRole("button", { name: "Close inspector" }).click();
  await open("playbooks");
  await expect(page.getByRole("heading", { name: /Real operating questions/ })).toBeVisible();
  await capture("scenario-playbooks", "playbooks", "interface");
  for (const view of [
    "scenario",
    "network",
    "inventory",
    "bullwhip",
    "resilience",
    "methodology",
  ]) {
    await open(view);
    await expect(page.getByTestId("study-ready")).toBeVisible();
    await capture(view, view, view === "inventory" ? "analytical" : "recorded");
  }
  await open("builder");
  await expect(page.getByRole("heading", { name: "Validated engine topology" })).toBeVisible();
  await page.getByLabel("Model name", { exact: true }).fill("Reference network design exercise");
  const savedModel = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portfolio",
  );
  await page.getByRole("button", { name: "Save network model", exact: true }).click();
  await expect(page.getByText("Saved revision 1 on this server.", { exact: true })).toBeVisible();
  await capture(
    "network-builder",
    "builder",
    "interface",
    page.getByRole("region", { name: "Interactive model canvas" }).locator(".."),
  );
  await saveEvidence("builder-evidence", {
    model: await (await savedModel).json(),
  });

  await open("learning", "&lesson=forecast");
  await expect(page.getByLabel("Guided experiment", { exact: true }).locator("option")).toHaveCount(
    10,
  );
  await capture("learning-sandbox", "learning", "interface");
  await page.getByRole("tab", { name: "Concept reference", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inside one simulation day" })).toBeVisible();
  await capture("learning-reference", "learning", "interface");
  await page.getByRole("tab", { name: "Guided experiments", exact: true }).click();
  await page
    .getByLabel("Student prediction")
    .fill(
      "A longer moving-average window may smooth the order signal but react more slowly. Compare service, inventory and the paired intervals before drawing a conclusion.",
    );
  await page.getByRole("button", { name: "Run learning experiment", exact: true }).click();
  const results = page.getByTestId("learning-results");
  await expect(results).toBeVisible({ timeout: 120000 });
  const a = await results.getAttribute("data-run-a"),
    b = await results.getAttribute("data-run-b");
  const comparison = await api(`/compare?a=${a}&b=${b}`);
  await expect(page.getByTestId("learning-delta-total_landed_cost_inr")).toHaveAttribute(
    "data-value",
    String(comparison.metrics.total_landed_cost_inr.mean),
  );
  await capture(
    "learning-results",
    "learning",
    "live",
    page.getByRole("table", { name: "Learning experiment results" }),
  );
  await saveEvidence("learning-evidence", {
    lesson: "forecast",
    comparison,
    provenance: [await api(`/runs/${a}/provenance`), await api(`/runs/${b}/provenance`)],
  });
  await page.getByRole("button", { name: "Explore daily A/B evidence" }).click();
  await page.getByLabel("Explorer source").selectOption("b");
  await page.getByLabel("Explorer metric", { exact: true }).selectOption("forecast");
  await expect(page.getByRole("region", { name: "Pre-demand forecast · line" })).toBeVisible();
  await capture("visual-explorer", "learning", "live", page.getByTestId("learning-explorer"));

  const catalog = JSON.parse(
    await readFile(resolve(root, "web/src/fixtures/learning.json"), "utf8"),
  );
  const lesson = catalog.lessons.find((row) => row.id === "forecast");
  const definitions = [];
  for (const condition of ["a", "b"]) {
    const scenario = await api("/portfolio", {
      name: `Forecast responsiveness · condition ${condition.toUpperCase()}`,
      notes: `ASSUMPTION: unmodified forecast lesson from configs/learning.yaml; synthetic demonstration, not a recommendation.`,
      request: lesson[`request_${condition}`],
    });
    await api(`/portfolio/${scenario.id}/runs`, { revision: scenario.revision });
    definitions.push(scenario);
  }
  await open("portfolio", `&portfolio=${definitions[1].id}`);
  await expect(page.getByTestId("latest-run-status")).toHaveText("complete", { timeout: 120000 });
  await capture("planning-lab", "portfolio", "interface", page.getByTestId("portfolio-editor"));
  await page.getByLabel("Portfolio baseline run A").fill(a);
  await page.getByRole("button", { name: "Compare selected runs", exact: true }).click();
  await expect(page.getByTestId("portfolio-cost-delta")).toHaveAttribute(
    "data-value",
    String(comparison.metrics.total_landed_cost_inr.mean),
  );
  await capture(
    "planning-comparison",
    "portfolio",
    "live",
    page.getByTestId("portfolio-comparison"),
  );
  await expect(page.getByRole("table", { name: "SKU shortage contributors" })).toBeVisible();
  await capture(
    "run-diagnostics",
    "portfolio",
    "live",
    page.getByRole("region", { name: "Run diagnostics" }),
  );
  await saveEvidence("planning-evidence", {
    definitions,
    comparison,
    diagnostics: await api(`/runs/${b}/diagnostics`),
    executions: await Promise.all(definitions.map((row) => api(`/portfolio/${row.id}/runs`))),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.getByRole("button", { name: "Motion preferences", exact: true }).click();
  await page.getByRole("radio", { name: "Reduce motion", exact: true }).check();
  await capture(
    "motion-mobile",
    "portfolio",
    "interface",
    page.getByRole("dialog", { name: "Motion preferences", exact: true }),
  );
  assert.deepEqual(errors, []);
  const sources = [
    "web/public/fixtures/tower.json",
    "web/public/fixtures/studies.json",
    "web/src/fixtures/learning.json",
    "web/src/fixtures/workspace.json",
    "web/src/fixtures/builder.json",
    "configs/learning.yaml",
    "configs/lab.yaml",
  ];
  await writeFile(
    resolve(root, `${folder}/manifest.json`),
    JSON.stringify(
      {
        ui_revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        captured_at: new Date().toISOString(),
        command: "npm run capture:walkthrough --prefix web",
        viewport: { width: 1440, height: 1080 },
        note: "Real Chromium screenshots. Live results use the unchanged canonical forecast lesson: synthetic assumptions and two replications, not empirical business findings. Motion settings use a 390×844 viewport.",
        modules,
        captures,
        source_sha256: Object.fromEntries(
          await Promise.all(
            sources.map(async (name) => [name, digest(await readFile(resolve(root, name)))]),
          ),
        ),
        evidence_sha256: Object.fromEntries(
          await Promise.all(
            evidence.map(async (name) => [name, digest(await readFile(resolve(root, name)))]),
          ),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Saved ${captures.length} real screenshots and ${evidence.length} engine evidence bundles in ${relative(root, resolve(root, folder))}`,
  );
} finally {
  await browser.close();
}
