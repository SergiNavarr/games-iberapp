// JUDGE · C03(b): importing the game module without calling mountGame (raw.importOnly()) → 0 canvas in the document,
// 0 requests to assetBase and 0 new listeners (any type, net) on window and document.
import { expect, test } from "@playwright/test";
import { instrumentListeners, type JudgeWindow } from "../spike/support";
import { ASSET_BASE, gotoBench, type ConformanceWindow } from "./support";

test("C03(b) · importar el módulo del juego no produce efectos", async ({ page }) => {
  await page.addInitScript(instrumentListeners);
  const requests: string[] = [];
  let recording = false;
  page.on("request", (req) => {
    if (recording) requests.push(req.url());
  });

  await gotoBench(page);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);
  const snap = await page.evaluate(() => (window as unknown as JudgeWindow).__judge.snapshot());
  recording = true;
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.importOnly());
  await page.waitForTimeout(1_000);
  recording = false;

  const listeners = await page.evaluate((s) => (window as unknown as JudgeWindow).__judge.activeSince(s, ["*"]), snap);
  const toAssetBase = requests.filter((u) => new URL(u).pathname.startsWith(ASSET_BASE));
  test.info().annotations.push({ type: "info", description: `pedidos durante la importación: ${requests.length}` });
  expect.soft(await page.evaluate(() => document.querySelectorAll("canvas").length), "canvas en el documento").toBe(0);
  expect.soft(toAssetBase, "pedidos a assetBase").toEqual([]);
  expect.soft(listeners.map((l) => `${l.target}.addEventListener("${l.type}")\n${l.stack}`), "listeners nuevos en window/document").toEqual([]);
});
