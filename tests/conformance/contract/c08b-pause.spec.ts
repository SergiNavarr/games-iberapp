// JUDGE · C08b (manual pause) and C08c (automatic pause: stage out of the viewport, hidden tab; each case separately),
// with the game in `playing` and reducedMotion off. "Still" window: starts 250 ms after the trigger and lasts 1 s; in it
// ≤ 2 requestAnimationFrame calls and two canvas captures 1 s apart identical byte for byte. After resuming, > 30 rAF
// in 1 s (also from 250 ms after). Captures go through CDP with captureBeyondViewport, so they work with the stage off
// screen without scrolling to it. Hidden is simulated by redefining document.visibilityState/hidden and dispatching
// visibilitychange (headless never hides a tab for real).
// E2, games that declare meta.stillWithoutInput (variants.ts keeps a copy; a [control] checks they match): the
// [control] is an input (with focus on the stage, ArrowRight changes the canvas); inside the still window ArrowRight is
// pressed again and debugMotion().created must not change; after resuming, > 30 rAF and a NEW ArrowRight changes the
// canvas (the queued one is not required to be processed: agreed with the coordinator). Same input in C08c (a) and (b).
import type { Page } from "@playwright/test";
import {
  BOX,
  canvasShot,
  countRaf,
  expect,
  gotoBench,
  instrumentProbe,
  loadMeta,
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

/** E2: the game's declaration (meta.stillWithoutInput), checked against the copy in variants.ts. */
async function stillWithoutInput(variant: Variant) {
  const declared = (await loadMeta(variant)).stillWithoutInput === true;
  expect(declared, "[control] meta.stillWithoutInput coincide con variants.ts").toBe(variant.stillWithoutInput === true);
  return declared;
}

/** [control] Without any pause the canvas moves: two captures 1 s apart differ (else "identical" proves nothing). */
async function expectMoving(page: Page) {
  const a = await canvasShot(page);
  await page.waitForTimeout(1_000);
  const b = await canvasShot(page);
  expect(a !== b, "[control] sin pausa el canvas no cambia en 1 s: las capturas idénticas no probarían nada").toBe(true);
}

/** With focus on the stage, ArrowRight changes the canvas within 250 ms. */
async function arrowChangesCanvas(page: Page) {
  await page.locator(STAGE).focus();
  const a = await canvasShot(page);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(SETTLE_MS);
  return a !== (await canvasShot(page));
}

/** The control of each game: its own motion, or (stillWithoutInput) an arrow that moves the crosshair. */
async function expectAlive(page: Page, still: boolean) {
  if (!still) return expectMoving(page);
  expect(await arrowChangesCanvas(page), "[control] sin pausa, con foco en el escenario, ArrowRight no cambia el canvas: las capturas idénticas no probarían nada").toBe(true);
}

/** The still window; `input`: ArrowRight pressed inside it (focus stays on the stage). */
async function stillWindow(page: Page, input = false) {
  await page.waitForTimeout(SETTLE_MS);
  const read = () =>
    page.evaluate(() => ({
      raf: (window as unknown as JudgeProbe).__judgeProbe.raf,
      t: performance.now(),
      created: (window as unknown as ConformanceWindow).__conformance.handle()?.debugMotion?.()?.created ?? null,
    }));
  const start = await read();
  const first = await canvasShot(page);
  if (input) await page.keyboard.press("ArrowRight");
  await page.evaluate(async (t0) => {
    const left = 1_000 - (performance.now() - t0);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
  }, start.t);
  const second = await canvasShot(page);
  const end = await read();
  return { raf: end.raf - start.raf, same: first === second, created: [start.created, end.created] as const };
}

async function resumedRaf(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
  return countRaf(page, 1_000);
}

/** E2 checks of a stillWithoutInput game: created unchanged in the window; after resuming, a new arrow moves the canvas. */
async function expectStillChecks(page: Page, still: boolean, created: readonly [number | null, number | null], where: string) {
  if (!still) return;
  expect(created[0], "[control] debugMotion() con testHooks").not.toBeNull();
  expect.soft(created[1], `debugMotion().created al final de la ventana (${where}; al inicio ${created[0]}, con ArrowRight en la ventana)`).toBe(created[0]);
  expect.soft(await arrowChangesCanvas(page), `al reanudar (${where}), una flecha nueva cambia el canvas`).toBe(true);
}

test("C08b · pause(): ≤ 2 rAF en 1 s y capturas idénticas; resume(): > 30 rAF en 1 s", async ({ page, variant }) => {
  await playingInView(page, variant);
  const still = await stillWithoutInput(variant);
  await expectAlive(page, still);
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.handle()?.pause());
  const w = await stillWindow(page, still);
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.handle()?.resume());
  const resumed = await resumedRaf(page);
  expect.soft(w.raf, "rAF en 1 s con pause()").toBeLessThanOrEqual(2);
  expect.soft(w.same, `capturas del canvas con 1 s de diferencia, en pausa${still ? " (con ArrowRight en la ventana)" : ""}`).toBe(true);
  expect.soft(resumed, "rAF en 1 s después de resume()").toBeGreaterThan(30);
  await expectStillChecks(page, still, w.created, "resume()");
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
  const still = await stillWithoutInput(variant);
  await expectAlive(page, still);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const offscreen = await page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return !!r && (r.top >= window.innerHeight || r.bottom <= 0);
  }, BOX);
  expect(offscreen, "[control] el escenario sigue en el viewport después del scroll").toBe(true);
  const w = await stillWindow(page, still);
  await centerStage(page);
  const resumed = await resumedRaf(page);
  expect.soft(w.raf, "rAF en 1 s con el escenario fuera del viewport").toBeLessThanOrEqual(2);
  expect.soft(w.same, `capturas del canvas con 1 s de diferencia, fuera del viewport${still ? " (con ArrowRight en la ventana)" : ""}`).toBe(true);
  expect.soft(resumed, "rAF en 1 s con el escenario de vuelta en pantalla").toBeGreaterThan(30);
  await expectStillChecks(page, still, w.created, "de vuelta en pantalla");
});

test("C08c(b) · pestaña oculta: ≤ 2 rAF y capturas idénticas; visible de nuevo: > 30 rAF", async ({ page, variant }) => {
  await playingInView(page, variant);
  const still = await stillWithoutInput(variant);
  await expectAlive(page, still);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  const w = await stillWindow(page, still);
  await setHidden(false);
  const resumed = await resumedRaf(page);
  expect.soft(w.raf, "rAF en 1 s con la pestaña oculta").toBeLessThanOrEqual(2);
  expect.soft(w.same, `capturas del canvas con 1 s de diferencia, pestaña oculta${still ? " (con ArrowRight en la ventana)" : ""}`).toBe(true);
  expect.soft(resumed, "rAF en 1 s con la pestaña visible de nuevo").toBeGreaterThan(30);
  await expectStillChecks(page, still, w.created, "pestaña visible de nuevo");
});
