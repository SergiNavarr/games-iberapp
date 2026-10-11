// JUDGE · C09(b)–C12 (living with the page), the same tests as T2's S6 with the `_dummy` in `playing` via "Empezar".
// C09(a) is in c00-static.spec.ts. Steps marked [control] validate the test mechanism, not the code. Nothing here
// requires arrows to scroll with the focus INSIDE the stage (the game prevents the default of its keys there).
import { expect, test, type Page } from "@playwright/test";
import {
  canvasCenter,
  cdpSwipe,
  elementAt,
  instrumentListeners,
  placeCanvasAt,
  pointInStage,
  scrollAfter,
  scrollY,
  type JudgeWindow,
} from "../spike/support";
import { BOX, gotoBench, startGame, STAGE } from "./support";

const KEY_TYPES = ["keydown", "keyup"];

/** Box top at `fraction` of the viewport; returns a point in the spacer above it (no stage, no control). */
async function spacerPoint(page: Page, fraction = 0.5) {
  await page.evaluate(
    ([sel, f]) => {
      const box = document.querySelector(sel);
      if (!box) throw new Error("sin caja");
      window.scrollTo({ top: Math.max(0, window.scrollY + box.getBoundingClientRect().top - window.innerHeight * f), behavior: "instant" });
    },
    [BOX, fraction] as const,
  );
  await page.waitForTimeout(100);
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const point = { x: vp.width / 2, y: vp.height * fraction * 0.5 };
  const target = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { interactive: !!el?.closest("button, a, input, select, textarea, [tabindex]"), tag: el?.tagName ?? "" };
  }, [point.x, point.y] as const);
  expect(await pointInStage(page, point.x, point.y), "[control] el punto cae dentro del escenario").toBe(false);
  expect(target.interactive, `[control] el punto cae sobre un elemento interactivo (${target.tag})`).toBe(false);
  return point;
}

async function focusOutsideStage(page: Page) {
  const p = await spacerPoint(page);
  await page.mouse.click(p.x, p.y);
  const focusInside = await page.evaluate((sel) => {
    const stage = document.querySelector(sel);
    return !!(stage && document.activeElement && stage.contains(document.activeElement));
  }, STAGE);
  expect(focusInside, "[control] después del clic en el cuerpo el foco sigue dentro del escenario").toBe(false);
}

test("C09(b) · después de montar, 0 listeners nuevos de keydown/keyup en window y document", async ({ page }) => {
  await page.addInitScript(instrumentListeners);
  await gotoBench(page);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);
  const snap = await page.evaluate(() => (window as unknown as JudgeWindow).__judge.snapshot());
  await startGame(page);
  await page.waitForTimeout(500);
  const result = await page.evaluate(
    ([s, types]) => {
      const judge = (window as unknown as JudgeWindow).__judge;
      return { active: judge.activeSince(s, types), adds: judge.addCallsSince(s, types) };
    },
    [snap, KEY_TYPES] as const,
  );
  test.info().annotations.push({ type: "info", description: `llamadas a addEventListener(keydown|keyup) desde el montaje: ${result.adds.length}` });
  expect(result.active.map((a) => `${a.target}.addEventListener("${a.type}") capture=${a.capture}\n${a.stack}`)).toEqual([]);
});

test("C10 · con el foco fuera, Space, PageDown y ArrowDown scrollean; Escape llega a window", async ({ page }) => {
  await gotoBench(page);
  await startGame(page);
  await focusOutsideStage(page);
  for (const key of ["Space", "PageDown", "ArrowDown"]) {
    const before = await scrollY(page);
    await page.keyboard.press(key);
    expect.soft(await scrollAfter(page, before), `${key} con el foco fuera: scrollY antes ${before}`).toBeGreaterThan(before);
  }
  await page.evaluate(() => {
    const w = window as unknown as { __judgeEscape: number };
    w.__judgeEscape = 0;
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") w.__judgeEscape++;
    });
  });
  await page.keyboard.press("Escape");
  expect.soft(await page.evaluate(() => (window as unknown as { __judgeEscape: number }).__judgeEscape), "Escape en el listener de window").toBe(1);
});

test("C11 · mouse.wheel(0, 400) sobre el canvas y fuera de él scrollea", async ({ page }) => {
  await gotoBench(page);
  await startGame(page);

  const p = await spacerPoint(page);
  await page.mouse.move(p.x, p.y);
  const outBefore = await scrollY(page);
  await page.mouse.wheel(0, 400);
  expect.soft(await scrollAfter(page, outBefore), `rueda fuera del canvas: scrollY antes ${outBefore}`).toBeGreaterThan(outBefore);

  await placeCanvasAt(page, 0.5);
  const c = await canvasCenter(page);
  test.info().annotations.push({ type: "info", description: `elemento bajo el puntero: ${await elementAt(page, c.x, c.y)}` });
  await page.mouse.move(c.x, c.y);
  const before = await scrollY(page);
  await page.mouse.wheel(0, 400);
  expect.soft(await scrollAfter(page, before), `rueda sobre el canvas: scrollY antes ${before}`).toBeGreaterThan(before);
});

test.describe("C12 · celular 390×844 con toque", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("C12 · deslizamiento vertical por CDP sobre el canvas scrollea y touchAction ≠ none", async ({ page }) => {
    await gotoBench(page);
    await startGame(page);

    // [control] the same swipe over the spacer must scroll.
    const p = await spacerPoint(page, 0.6);
    const controlBefore = await scrollY(page);
    await cdpSwipe(page, p.x, p.y + 150, p.y - 150);
    expect(await scrollAfter(page, controlBefore), "[control] el deslizamiento fuera del canvas no scrollea").toBeGreaterThan(controlBefore);

    await placeCanvasAt(page, 0.5);
    const c = await canvasCenter(page);
    const span = Math.min(300, c.height * 0.6);
    test.info().annotations.push({ type: "info", description: `elemento al inicio del gesto: ${await elementAt(page, c.x, c.y + span / 2)}` });
    const before = await scrollY(page);
    await cdpSwipe(page, c.x, c.y + span / 2, c.y - span / 2);
    expect.soft(await scrollAfter(page, before), `deslizamiento sobre el canvas: scrollY antes ${before}`).toBeGreaterThan(before);

    const touchAction = await page.evaluate((sel) => {
      const canvas = document.querySelector(sel)?.querySelector("canvas");
      return canvas ? getComputedStyle(canvas).touchAction : null;
    }, STAGE);
    expect.soft(touchAction, "touchAction del canvas").not.toBeNull();
    expect.soft(touchAction, "touchAction del canvas").not.toBe("none");
  });
});
