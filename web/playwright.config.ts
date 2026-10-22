import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const python = resolve(
  process.platform === "win32" ? "../.venv/Scripts/python.exe" : "../.venv/bin/python",
);
if (!existsSync(python))
  throw new Error("Install the repository Python environment before browser tests");
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  reporter: [["list"], ["json", { outputFile: "../data/m9-playwright/results.json" }]],
  outputDir: "../data/m9-playwright/artifacts",
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  webServer: [
    {
      command: "npm run start",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `"${python}" -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000`,
      cwd: "..",
      env: { SCM_RUN_ROOT: "data/browser-workspace/runs" },
      url: "http://127.0.0.1:8000/openapi.json",
      reuseExistingServer: false,
    },
  ],
});
