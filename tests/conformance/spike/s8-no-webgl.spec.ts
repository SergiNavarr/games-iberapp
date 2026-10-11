// JUDGE · S8: Chromium launched with --disable-webgl --disable-3d-apis (project "no-webgl" in
// playwright.conformance.config.ts): mount() reaches `ready`, renderer() === "CANVAS", 0 pageerror.
import { expect, test } from "@playwright/test";
import { gotoSpike, mountAndWaitReady, watchConsole, type SpikeWindow } from "./support";

test("S8 · control de entorno: este Chromium no tiene WebGL", async ({ page }) => {
  await page.setContent("<canvas></canvas>");
  const contexts = await page.evaluate(() => ({
    webgl: !!document.createElement("canvas").getContext("webgl"),
    webgl2: !!document.createElement("canvas").getContext("webgl2"),
  }));
  expect(contexts, "[control] los flags no desactivaron WebGL: S8 no sería verificable").toEqual({ webgl: false, webgl2: false });
});

test("S8 · sin WebGL el juego monta con renderer Canvas", async ({ page }) => {
  const c = watchConsole(page);
  await gotoSpike(page);
  await mountAndWaitReady(page);
  expect.soft(await page.evaluate(() => (window as unknown as SpikeWindow).__spike.renderer()), "renderer()").toBe("CANVAS");
  expect.soft(c.pageErrors, "pageerror").toEqual([]);
});
