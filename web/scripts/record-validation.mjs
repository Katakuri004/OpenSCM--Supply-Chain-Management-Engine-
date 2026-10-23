import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { platform, release } from "node:os";
import { resolve, relative } from "node:path";

const root = resolve("..");
const output = resolve(root, "docs/evidence/decision-cases");
const report = JSON.parse(await readFile(resolve(root, "data/m9-playwright/results.json"), "utf8"));
const tests = [];
let performance;
const exercises = [];
const portfolios = [];
const learning = [];
const models = [];
const interactions = [];
const cases = [];
function visit(suite) {
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests) {
      const result = test.results.at(-1);
      tests.push({ name: spec.title, status: result.status, duration_ms: result.duration });
      for (const attachment of result.attachments ?? []) {
        if (attachment.name === "scrubber-performance") {
          performance = JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8"));
        }
        if (attachment.name === "operating-playbook") {
          exercises.push(JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")));
        }
        if (attachment.name === "planning-portfolio") {
          portfolios.push(JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")));
        }
        if (attachment.name === "student-experiment") {
          learning.push(JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")));
        }
        if (attachment.name === "network-builder") {
          models.push(JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")));
        }
        if (attachment.name === "decision-case") {
          cases.push(JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")));
        }
        if (attachment.name === "interaction-motion") {
          interactions.push(JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")));
        }
      }
    }
  for (const child of suite.suites ?? []) visit(child);
}
visit(report);
if (
  !tests.length ||
  tests.some((test) => test.status !== "passed") ||
  !performance ||
  !exercises.length ||
  !portfolios.length ||
  !learning.length ||
  !models.length ||
  !interactions.length ||
  !cases.length ||
  report.errors.length
)
  throw new Error("Run passing browser tests before recording evidence");
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, "results.json"),
  JSON.stringify(
    {
      passed: true,
      browser: "Playwright Chromium",
      viewport: { width: 1440, height: 1000 },
      platform: `${platform()} ${release()}`,
      node: process.version,
      tests,
      performance,
      exercises,
      portfolios,
      learning,
      models,
      interactions,
      cases,
    },
    null,
    2,
  ) + "\n",
);
async function files(folder) {
  const entries = await readdir(resolve(root, folder), { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`],
    ),
  );
  return paths.flat();
}
async function hashes(paths) {
  return Object.fromEntries(
    await Promise.all(
      paths.sort().map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(resolve(root, path)))
          .digest("hex"),
      ]),
    ),
  );
}
const sources = (
  await Promise.all(
    [
      "engine/src/scm",
      "api",
      "configs",
      "contracts",
      "web/app",
      "web/src",
      "web/scripts",
      "web/e2e",
      "web/tests",
    ].map(files),
  )
)
  .flat()
  .filter((path) => /\.(py|ts|tsx|css|json|mjs|yaml)$/.test(path));
sources.push(
  "web/package-lock.json",
  "web/package.json",
  "web/tsconfig.json",
  "web/next.config.ts",
  "web/vitest.config.ts",
  "web/postcss.config.mjs",
  "web/playwright.config.ts",
  "web/.prettierrc.json",
  "web/.prettierignore",
  "web/components.json",
  "requirements-dev.lock",
  "docs/decision-cases.md",
  "tests/test_decision_cases.py",
  "docs/parameters.md",
  "docs/assumptions.md",
  "docs/validation.md",
  "docs/study-views.md",
  "docs/operations-workspace.md",
  "docs/planning-lab.md",
  "docs/learning-sandbox.md",
  "tests/test_learning_workspace.py",
  "tests/test_network_builder.py",
  "docs/network-builder.md",
  "docs/interaction-motion.md",
  "docs/upgrade-roadmap.md",
  "tests/test_planning_lab.py",
  "LICENSE",
  "NOTICE",
  "README.md",
  "CONTRIBUTING.md",
  "pyproject.toml",
  "tests/test_workspace.py",
  "docs/plan.md",
);
const versions = Object.fromEntries(
  await Promise.all(
    ["react", "next", "cytoscape", "echarts", "katex", "@playwright/test", "vitest"].map(
      async (name) => [
        name,
        JSON.parse(await readFile(resolve(`node_modules/${name}/package.json`), "utf8")).version,
      ],
    ),
  ),
);
const artifacts = [
  "docs/evidence/decision-cases/results.json",
  "docs/evidence/m10/fixture_manifest.json",
  "docs/evidence/m9/fixture_manifest.json",
  "web/public/fixtures/studies.json",
  "web/public/fixtures/tower.json",
  "web/src/fixtures/request.json",
  ...(await files("web/e2e/snapshots")),
];
await writeFile(
  resolve(output, "manifest.json"),
  JSON.stringify(
    {
      command: "npm run test:e2e --prefix web; npm run record:evidence --prefix web",
      git_sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      git_worktree_dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0,
      versions,
      input_sha256: await hashes(sources),
      output_sha256: await hashes(artifacts),
      output_directory: relative(root, output).replaceAll("\\", "/"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Recorded ${tests.length} passing browser tests, 100-node health batch p95 ${performance.batch_p95_ms.toFixed(3)} ms`,
);
