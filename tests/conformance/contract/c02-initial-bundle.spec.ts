// JUDGE · C02 (project "contract-start", next start): loading /conformance/_dummy without touching "Empezar" and
// without scrolling, no JS response body contains both "3.90.0" and "Phaser"; after "Empezar", some does.
import { expect, test } from "@playwright/test";
import { BOX, gotoBench, startGame } from "./support";
import { watchJsBodies } from "./support-bundle";

test("C02 · Phaser fuera del bundle inicial (next start)", async ({ page }) => {
  const js = watchJsBodies(page);
  await gotoBench(page);
  // [control] the stage starts farther than 600 px below the viewport, so the 600 px preload cannot fire on load.
  const distance = await page.evaluate((sel) => (document.querySelector(sel)?.getBoundingClientRect().top ?? 0) - window.innerHeight, BOX);
  expect(distance, "[control] el escenario arranca a menos de 600 px del viewport: la carga dispararía la precarga").toBeGreaterThan(600);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2_000);
  const onLoad = await js.settle("load");
  test.info().annotations.push({ type: "info", description: `respuestas JS al cargar: ${onLoad.length}` });
  expect(onLoad.length, "[control] no se registró ninguna respuesta JS al cargar").toBeGreaterThan(0);
  expect.soft(onLoad.filter((b) => b.hasPhaser).map((b) => b.url), "respuestas JS con Phaser antes de Empezar").toEqual([]);

  js.phase = "start";
  await startGame(page, 30_000);
  await page.waitForLoadState("networkidle");
  const withPhaser = (await js.settle("start")).filter((b) => b.hasPhaser).map((b) => b.url);
  test.info().annotations.push({ type: "info", description: `respuestas JS con Phaser después de Empezar: ${withPhaser.join(", ") || "(ninguna)"}` });
  expect.soft(withPhaser.length, "respuestas JS con Phaser después de Empezar").toBeGreaterThan(0);
});
