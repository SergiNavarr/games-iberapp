// JUDGE · C16 (no horizontal scroll), C17(b) (size follows the container) and C18 (section proportion).
// C17(a) is in c00-static.spec.ts.
import { expect, test } from "@playwright/test";
import { containedWithin, stageAndCanvasRects } from "../spike/support";
import { completeWithKeyboard, gotoBench, startGame, waitForState, type ConformanceWindow } from "./support";

const C16_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

for (const viewport of C16_VIEWPORTS) {
  test(`C16 · sin scroll horizontal a ${viewport.width} px en intro, playing y result`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await gotoBench(page);
    await waitForState(page, "intro");
    expect.soft(await overflow(), "intro: scrollWidth − innerWidth").toBeLessThanOrEqual(0);
    await startGame(page);
    expect.soft(await overflow(), "playing: scrollWidth − innerWidth").toBeLessThanOrEqual(0);
    await completeWithKeyboard(page);
    await waitForState(page, "result");
    expect.soft(await overflow(), "result: scrollWidth − innerWidth").toBeLessThanOrEqual(0);
  });
}

test("C17(b) · el canvas queda dentro del escenario y sigue a un cambio de tamaño solo del contenedor en ≤ 500 ms", async ({ page }) => {
  await gotoBench(page);
  await startGame(page);
  await page.waitForTimeout(500);
  const fmt = (r: unknown) => JSON.stringify(r);
  const initial = await stageAndCanvasRects(page);
  expect(initial.stage && initial.canvas, "escenario y canvas").toBeTruthy();
  expect.soft(containedWithin(initial.canvas!, initial.stage!), `canvas ${fmt(initial.canvas)} dentro de ${fmt(initial.stage)} ±1 px`).toBe(true);

  const viewportBefore = page.viewportSize();
  await page.evaluate(async () => {
    (window as unknown as ConformanceWindow).__conformance.setBoxWidth(500);
    await new Promise((r) => setTimeout(r, 500));
  });
  const after = await stageAndCanvasRects(page);
  expect(page.viewportSize(), "[control] la ventana no cambió").toEqual(viewportBefore);
  expect(after.stage && after.canvas, "escenario y canvas").toBeTruthy();
  expect(Math.abs(after.stage!.width - initial.stage!.width) > 1, `[control] setBoxWidth(500) no cambió el escenario (${fmt(after.stage)})`).toBe(true);
  expect.soft(containedWithin(after.canvas!, after.stage!), `a los 500 ms: canvas ${fmt(after.canvas)} dentro de ${fmt(after.stage)} ±1 px`).toBe(true);
  const changed = Math.abs(after.canvas!.width - initial.canvas!.width) > 1 || Math.abs(after.canvas!.height - initial.canvas!.height) > 1;
  expect.soft(changed, `el canvas no cambió de tamaño (antes ${fmt(initial.canvas)}, después ${fmt(after.canvas)})`).toBe(true);
});

const C18_CASES = [
  { width: 390, height: 844, ratio: 4 / 5, label: "4:5" },
  { width: 768, height: 1024, ratio: 16 / 9, label: "16:9" },
  { width: 1440, height: 900, ratio: 16 / 9, label: "16:9" },
];

for (const c of C18_CASES) {
  test(`C18 · el escenario mide ${c.label} (±1%) a ${c.width} px`, async ({ page }) => {
    await page.setViewportSize({ width: c.width, height: c.height });
    await gotoBench(page);
    await startGame(page);
    const { stage } = await stageAndCanvasRects(page);
    expect(stage, "escenario").not.toBeNull();
    const ratio = stage!.width / stage!.height;
    expect(Math.abs(ratio / c.ratio - 1), `proporción ${ratio.toFixed(4)} (${stage!.width}×${stage!.height}) vs ${c.label}`).toBeLessThanOrEqual(0.01);
  });
}
