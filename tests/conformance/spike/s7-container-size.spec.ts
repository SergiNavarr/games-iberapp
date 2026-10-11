// JUDGE · S7 = C17 adapted to the spike: the canvas stays within the stage (±1 px); after resizeStage(400, 500) the canvas
// follows it within 500 ms (contained again in the new stage AND its size changed); `rg "innerWidth|innerHeight|screen\."`
// in lib/games/_spike → 0.
import { expect, test } from "@playwright/test";
import { containedWithin, gotoSpike, grepDir, mountAndWaitReady, SPIKE_DIR, stageAndCanvasRects, type SpikeWindow } from "./support";

const TOLERANCE_PX = 1;

test('S7 · rg "innerWidth|innerHeight|screen\\." en lib/games/_spike → 0', () => {
  expect(grepDir(SPIKE_DIR, /innerWidth|innerHeight|screen\./)).toEqual([]);
});

test("S7 · el canvas queda dentro del escenario y sigue a resizeStage(400, 500) en ≤ 500 ms", async ({ page }) => {
  await gotoSpike(page);
  await mountAndWaitReady(page);
  await page.waitForTimeout(500);

  const initial = await stageAndCanvasRects(page);
  expect(initial.stage, "escenario").not.toBeNull();
  expect(initial.canvas, "canvas dentro del escenario").not.toBeNull();
  const fmt = (r: unknown) => JSON.stringify(r);
  expect
    .soft(containedWithin(initial.canvas!, initial.stage!, TOLERANCE_PX), `canvas ${fmt(initial.canvas)} dentro de escenario ${fmt(initial.stage)} ±1 px`)
    .toBe(true);

  await page.evaluate(async () => {
    (window as unknown as SpikeWindow).__spike.resizeStage(400, 500);
    await new Promise((r) => setTimeout(r, 500));
  });
  const after = await stageAndCanvasRects(page);
  expect(after.stage, "escenario").not.toBeNull();
  expect(after.canvas, "canvas dentro del escenario").not.toBeNull();
  // [control] the fixed interface: resizeStage must size the stage itself.
  expect(Math.abs(after.stage!.width - 400) <= TOLERANCE_PX && Math.abs(after.stage!.height - 500) <= TOLERANCE_PX, `[control] resizeStage(400, 500) dejó el escenario en ${fmt(after.stage)}`).toBe(true);
  expect
    .soft(containedWithin(after.canvas!, after.stage!, TOLERANCE_PX), `a los 500 ms: canvas ${fmt(after.canvas)} dentro de escenario ${fmt(after.stage)} ±1 px`)
    .toBe(true);
  const changed =
    Math.abs(after.canvas!.width - initial.canvas!.width) > TOLERANCE_PX || Math.abs(after.canvas!.height - initial.canvas!.height) > TOLERANCE_PX;
  expect.soft(changed, `el canvas no cambió de tamaño (antes ${fmt(initial.canvas)}, después ${fmt(after.canvas)})`).toBe(true);
});
