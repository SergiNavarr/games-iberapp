// JUDGE · C08b (manual pause) and C08c (automatic pause: stage out of the viewport, hidden tab; each case separately),
// with the game in `playing` and reducedMotion off. "Still" window: starts 250 ms after the trigger and lasts 1 s; in it
// ≤ 2 requestAnimationFrame calls and two canvas captures 1 s apart identical byte for byte. After resuming, > 30 rAF
// in 1 s (also from 250 ms after). Captures go through CDP with captureBeyondViewport, so they work with the stage off
// screen without scrolling to it. Hidden is simulated by redefining document.visibilityState/hidden and dispatching
// visibilitychange (headless never hides a tab for real).
import type { Page } from "@playwright/test";
import {
  BOX,
  canvasShot,
  countRaf,
  expect,
  gotoBench,
  instrumentProbe,
  realParams,
  startGame,
  STAGE,
  test,
  watchConsole,
  type ConformanceWindow,
  type JudgeProbe,
  type Variant,
} from "./support";

const SETTLE_MS = 250;

/** Run games play at ×1 here: the run lasts long enough for the control, the still window and the resume window. */
async function playingInView(page: Page, variant: Variant) {
  await page.addInitScript(instrumentProbe);
  await gotoBench(page, variant.id, realParams({ reducedMotion: false }));
  await startGame(page);
  await centerStage(page);
  await page.waitForTimeout(500);
}

function centerStage(page: Page) {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (!r) throw new Error("sin escenario");
    window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, behavior: "instant" });
  }, STAGE);
}

/** [control] Without any pause the canvas moves: two captures 1 s apart differ (else "identical" proves nothing). */
async function expectMoving(page: Page) {
  const a = await canvasShot(page);
  await page.waitForTimeout(1_000);
  const b = await canvasShot(page);
  expect(a !== b, "[control] sin pausa el canvas no cambia en 1 s: las capturas idénticas no probarían nada").toBe(true);
}

async function stillWindow(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
  const start = await page.evaluate(() => ({ raf: (window as unknown as JudgeProbe).__judgeProbe.raf, t: performance.now() }));
  const first = await canvasShot(page);
  await page.evaluate(async (t0) => {
    const left = 1_000 - (performance.now() - t0);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
  }, start.t);
  const second = await canvasShot(page);
  const raf = (await page.evaluate(() => (window as unknown as JudgeProbe).__judgeProbe.raf)) - start.raf;
  return { raf, same: first === second };
}

async function resumedRaf(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
  return countRaf(page, 1_000);
}

test("C08b · pause(): ≤ 2 rAF en 1 s y capturas idénticas; resume(): > 30 rAF en 1 s", async ({ page, variant }) => {
  await playingInView(page, variant);
  await expectMoving(page);
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.handle()?.pause());
  const still = await stillWindow(page);
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.handle()?.resume());
  const resumed = await resumedRaf(page);
  expect.soft(still.raf, "rAF en 1 s con pause()").toBeLessThanOrEqual(2);
  expect.soft(still.same, "capturas del canvas con 1 s de diferencia, en pausa").toBe(true);
  expect.soft(resumed, "rAF en 1 s después de resume()").toBeGreaterThan(30);
});

test("C08b · resume() sin pause() previo y pause() dos veces seguidas: sin excepción ni console.error", async ({ page, variant }) => {
  const c = watchConsole(page, variant.assetBase);
  await playingInView(page, variant);
  const outcome = await page.evaluate(() => {
    const h = (window as unknown as ConformanceWindow).__conformance.handle();
    if (!h) return "sin handle";
    try {
      h.resume();
      h.pause();
      h.pause();
      h.resume();
      return "ok";
    } catch (e) {
      return `excepción: ${String(e)}`;
    }
  });
  await page.waitForTimeout(500);
  expect.soft(outcome, "resume() sin pausa previa, pause() ×2").toBe("ok");
  expect.soft(c.pageErrors, "pageerror").toEqual([]);
  expect.soft(c.errors(), "console.error (sin los 404 de assetBase)").toEqual([]);
});

test("C08c(a) · escenario fuera del viewport: ≤ 2 rAF y capturas idénticas; de vuelta en pantalla: > 30 rAF", async ({ page, variant }) => {
  await playingInView(page, variant);
  await expectMoving(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const offscreen = await page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return !!r && (r.top >= window.innerHeight || r.bottom <= 0);
  }, BOX);
  expect(offscreen, "[control] el escenario sigue en el viewport después del scroll").toBe(true);
  const still = await stillWindow(page);
  await centerStage(page);
  const resumed = await resumedRaf(page);
  expect.soft(still.raf, "rAF en 1 s con el escenario fuera del viewport").toBeLessThanOrEqual(2);
  expect.soft(still.same, "capturas del canvas con 1 s de diferencia, fuera del viewport").toBe(true);
  expect.soft(resumed, "rAF en 1 s con el escenario de vuelta en pantalla").toBeGreaterThan(30);
});

test("C08c(b) · pestaña oculta: ≤ 2 rAF y capturas idénticas; visible de nuevo: > 30 rAF", async ({ page, variant }) => {
  await playingInView(page, variant);
  await expectMoving(page);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  const still = await stillWindow(page);
  await setHidden(false);
  const resumed = await resumedRaf(page);
  expect.soft(still.raf, "rAF en 1 s con la pestaña oculta").toBeLessThanOrEqual(2);
  expect.soft(still.same, "capturas del canvas con 1 s de diferencia, pestaña oculta").toBe(true);
  expect.soft(resumed, "rAF en 1 s con la pestaña visible de nuevo").toBeGreaterThan(30);
});
