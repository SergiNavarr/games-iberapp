// JUDGE · S6 = C09–C12 of the plan, adapted to the spike ("playing" = after mount() and `ready`). Tests tagged
// @c09-c12-extra are the parts of C09–C12 that the ticket's S6 summary does not list (`addKeys(.*true` search, Escape,
// wheel outside the canvas, touchAction). Steps marked [control] validate the test mechanism, not the code.
// Nothing here requires arrows to scroll with the focus INSIDE the stage (the spike captures them there on purpose).
import { expect, test, type Page } from "@playwright/test";
import {
  canvasCenter,
  cdpSwipe,
  elementAt,
  gotoSpike,
  grepDir,
  instrumentListeners,
  mountAndWaitReady,
  placeCanvasAt,
  placeStageTopAt,
  pointInStage,
  scrollAfter,
  scrollY,
  SPIKE_DIR,
  STAGE,
  type JudgeWindow,
} from "./support";

const EXTRA = { tag: "@c09-c12-extra" };
const KEY_TYPES = ["keydown", "keyup"];

async function startPlaying(page: Page) {
  await gotoSpike(page);
  await mountAndWaitReady(page);
}

/** Stage top at 40% of the viewport; clicks the spacer above it so the focus leaves the stage ("clic en el cuerpo"). */
async function focusOutsideStage(page: Page) {
  await placeStageTopAt(page, 0.4);
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = vp.width / 2;
  const y = vp.height * 0.2;
  expect(await pointInStage(page, x, y), "[control] el punto de clic cae dentro del escenario").toBe(false);
  await page.mouse.click(x, y);
  const focusInside = await page.evaluate((sel) => {
    const stage = document.querySelector(sel);
    return !!(stage && document.activeElement && stage.contains(document.activeElement));
  }, STAGE);
  expect(focusInside, "[control] después del clic en el cuerpo el foco sigue dentro del escenario").toBe(false);
}

test('S6 · C09(a) · rg "addCapture" en lib/games/_spike → 0', () => {
  expect(grepDir(SPIKE_DIR, /addCapture/)).toEqual([]);
});

test('S6 · C09(a) · rg "addKeys\\(.*true" en lib/games/_spike → 0', EXTRA, () => {
  expect(grepDir(SPIKE_DIR, /addKeys\(.*true/)).toEqual([]);
});

test("S6 · C09(b) · después de montar, 0 listeners nuevos de keydown/keyup en window y document", async ({ page }) => {
  await page.addInitScript(instrumentListeners);
  await gotoSpike(page);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);
  const snap = await page.evaluate(() => (window as unknown as JudgeWindow).__judge.snapshot());
  await mountAndWaitReady(page);
  await page.waitForTimeout(500);
  const result = await page.evaluate(
    ([s, types]) => {
      const judge = (window as unknown as JudgeWindow).__judge;
      return { active: judge.activeSince(s, types), adds: judge.addCallsSince(s, types) };
    },
    [snap, KEY_TYPES] as const,
  );
  test.info().annotations.push({
    type: "info",
    description: `llamadas a addEventListener(keydown|keyup) en window/document desde el montaje: ${result.adds.length}`,
  });
  // Net: listeners added after mount and still registered (Strict Mode may add and remove in between).
  expect(result.active.map((a) => `${a.target}.addEventListener("${a.type}") capture=${a.capture}\n${a.stack}`)).toEqual([]);
});

test("S6 · C10 · con el foco fuera del escenario, Space, PageDown y ArrowDown scrollean", async ({ page }) => {
  await startPlaying(page);
  await focusOutsideStage(page);
  for (const key of ["Space", "PageDown", "ArrowDown"]) {
    const before = await scrollY(page);
    await page.keyboard.press(key);
    const after = await scrollAfter(page, before);
    expect.soft(after, `${key} con el foco fuera: scrollY antes ${before}`).toBeGreaterThan(before);
  }
});

test("S6 · C10 · Escape llega a un listener de prueba en window", EXTRA, async ({ page }) => {
  await startPlaying(page);
  await focusOutsideStage(page);
  await page.evaluate(() => {
    const w = window as unknown as { __judgeEscape: number };
    w.__judgeEscape = 0;
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") w.__judgeEscape++;
    });
  });
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as unknown as { __judgeEscape: number }).__judgeEscape)).toBe(1);
});

async function wheelOutsideCanvas(page: Page) {
  await placeStageTopAt(page, 0.4);
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = vp.width / 2;
  const y = vp.height * 0.2;
  expect(await pointInStage(page, x, y), "[control] el puntero cae dentro del escenario").toBe(false);
  await page.mouse.move(x, y);
  const before = await scrollY(page);
  await page.mouse.wheel(0, 400);
  return { before, after: await scrollAfter(page, before) };
}

test("S6 · C11 · mouse.wheel(0, 400) sobre el canvas scrollea", async ({ page }) => {
  await startPlaying(page);
  const control = await wheelOutsideCanvas(page);
  expect(control.after, "[control] la rueda fuera del canvas no scrollea: el mecanismo de prueba no es válido").toBeGreaterThan(control.before);

  await placeCanvasAt(page, 0.5);
  const c = await canvasCenter(page);
  test.info().annotations.push({ type: "info", description: `elemento bajo el puntero: ${await elementAt(page, c.x, c.y)}` });
  await page.mouse.move(c.x, c.y);
  const before = await scrollY(page);
  await page.mouse.wheel(0, 400);
  expect(await scrollAfter(page, before), `rueda sobre el canvas: scrollY antes ${before}`).toBeGreaterThan(before);
});

test("S6 · C11 · mouse.wheel(0, 400) fuera del canvas scrollea", EXTRA, async ({ page }) => {
  await startPlaying(page);
  const r = await wheelOutsideCanvas(page);
  expect(r.after, `rueda fuera del canvas: scrollY antes ${r.before}`).toBeGreaterThan(r.before);
});

test.describe("S6 · C12 · celular 390×844 con toque", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("S6 · C12 · un deslizamiento vertical por CDP sobre el canvas scrollea", async ({ page }) => {
    await startPlaying(page);
    const vp = page.viewportSize() ?? { width: 390, height: 844 };

    // [control] the same swipe over the spacer above the stage must scroll.
    await placeStageTopAt(page, 0.6);
    expect(await pointInStage(page, vp.width / 2, vp.height * 0.5), "[control] el inicio del gesto cae dentro del escenario").toBe(false);
    const controlBefore = await scrollY(page);
    await cdpSwipe(page, vp.width / 2, vp.height * 0.5, vp.height * 0.15);
    const controlAfter = await scrollAfter(page, controlBefore);
    expect(controlAfter, "[control] el deslizamiento fuera del canvas no scrollea: el mecanismo de prueba no es válido").toBeGreaterThan(
      controlBefore,
    );

    await placeCanvasAt(page, 0.5);
    const c = await canvasCenter(page);
    const span = Math.min(300, c.height * 0.6);
    test.info().annotations.push({ type: "info", description: `elemento al inicio del gesto: ${await elementAt(page, c.x, c.y + span / 2)}` });
    const before = await scrollY(page);
    await cdpSwipe(page, c.x, c.y + span / 2, c.y - span / 2);
    expect(await scrollAfter(page, before), `deslizamiento sobre el canvas: scrollY antes ${before}`).toBeGreaterThan(before);
  });

  test("S6 · C12 · getComputedStyle(canvas).touchAction no es none", EXTRA, async ({ page }) => {
    await startPlaying(page);
    const touchAction = await page.evaluate((sel) => {
      const canvas = document.querySelector(sel)?.querySelector("canvas");
      return canvas ? getComputedStyle(canvas).touchAction : null;
    }, STAGE);
    expect(touchAction, "touchAction del canvas").not.toBeNull();
    expect(touchAction).not.toBe("none");
  });
});
