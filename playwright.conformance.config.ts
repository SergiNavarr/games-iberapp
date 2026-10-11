import { defineConfig, devices } from "@playwright/test";

// JUDGE: conformance suite (tests/conformance). Separate from playwright.config.ts (the coder's e2e tests).
// Own ports so it never touches the coder's dev server (3006): 3007 = next dev, 3008 = next start.
// `next start` serves the existing production build: run `npm run build` first (S2).
// Only one `next dev` may run per directory (Next 16 locks .next/dev): stop any other dev server before running this.
const DEV_PORT = Number(process.env.CONFORMANCE_DEV_PORT ?? 3007);
const START_PORT = Number(process.env.CONFORMANCE_START_PORT ?? 3008);
const DEV_URL = `http://localhost:${DEV_PORT}`;
const START_URL = `http://localhost:${START_PORT}`;
// Next's own binary (not npm/npx) so Playwright's process-tree kill leaves no orphan listening on the port.
const NEXT = "node node_modules/next/dist/bin/next";
// CONFORMANCE_SERVERS=dev skips `next start` (iterating on S3–S8 without a build).
const servers = (process.env.CONFORMANCE_SERVERS ?? "dev,start").split(",");

export default defineConfig({
  testDir: "./tests/conformance",
  outputDir: "./tests/.results/conformance",
  // Timing-sensitive tests (S4, S7): one worker, no retries, so every verdict comes from a single plain run.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  webServer: [
    ...(servers.includes("dev")
      ? [{ command: `${NEXT} dev -p ${DEV_PORT}`, url: DEV_URL, reuseExistingServer: false, timeout: 180_000, env: { NEXT_TELEMETRY_DISABLED: "1" } }]
      : []),
    ...(servers.includes("start")
      ? [{ command: `${NEXT} start -p ${START_PORT}`, url: START_URL, reuseExistingServer: false, timeout: 60_000, env: { NEXT_TELEMETRY_DISABLED: "1" } }]
      : []),
  ],
  // channel "chromium" = full Chromium in new headless mode, with the real GPU. The default headless shell renders WebGL
  // with SwiftShader, which prints "[.WebGL-…] GPU stall due to ReadPixels" warnings on its own and would make S5 fail
  // for reasons outside the code. With this channel a clean destroy prints nothing and a leak prints "Too many active
  // WebGL contexts" (checked by the controls in s5-no-leaks.spec.ts).
  projects: [
    { name: "dev", testMatch: /spike[\\/]s[3-7]-.*\.spec\.ts$/, use: { ...devices["Desktop Chrome"], channel: "chromium", baseURL: DEV_URL } },
    {
      name: "no-webgl",
      testMatch: /spike[\\/]s8-.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        baseURL: DEV_URL,
        launchOptions: { args: ["--disable-webgl", "--disable-3d-apis"] },
      },
    },
    { name: "start", testMatch: /spike[\\/]s9-.*\.spec\.ts$/, use: { ...devices["Desktop Chrome"], channel: "chromium", baseURL: START_URL } },
  ],
});
