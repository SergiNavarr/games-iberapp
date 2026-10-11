// JUDGE · S3: in `next dev` (Strict Mode), after __spike.mount() and `ready`, exactly 1 canvas in the page.
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { canvasCount, gotoSpike, mountAndWaitReady, readLog } from "./support";

test("S3 · un solo canvas en Strict Mode (next dev)", async ({ page }) => {
  // Precondition of the criterion ("en Strict Mode"): App Router enables it in dev unless next.config turns it off.
  const nextConfig = fs.readFileSync("next.config.ts", "utf8");
  expect(nextConfig, "S3 exige Strict Mode: next.config.ts no puede desactivar reactStrictMode").not.toMatch(/reactStrictMode\s*:\s*false/);

  await gotoSpike(page);
  await mountAndWaitReady(page);
  expect.soft(await canvasCount(page), "canvas en la página justo después de ready").toBe(1);
  await page.waitForTimeout(1_000);
  expect.soft(await canvasCount(page), "canvas en la página 1 s después de ready").toBe(1);

  const log = await readLog(page);
  test.info().annotations.push({ type: "info", description: `log: ${log.map((e) => e.event).join(", ")}` });
});
