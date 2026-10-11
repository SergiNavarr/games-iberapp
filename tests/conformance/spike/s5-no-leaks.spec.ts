// JUDGE · S5: 20 cycles mount() → ready → unmount(): no console message (any type) containing "WebGL" or "context lost";
// 0 canvas at the end (checked 500 ms after the last unmount, the same margin S4 uses).
import { expect, test, type Page } from "@playwright/test";
import { canvasCount, gotoSpike, mountAndWaitReady, unmountAndSettle, watchConsole, type SpikeWindow } from "./support";

const CYCLES = 20;
const FORBIDDEN = /webgl|context lost/i;

/** Creates 40 WebGL canvases, draws 3 frames on each and removes them, releasing the context or leaking it (kept referenced). */
async function churnContexts(page: Page, release: boolean) {
  await page.setContent("<div id=host></div>");
  return page.evaluate(async (lose) => {
    const leaked: WebGLRenderingContext[] = [];
    (window as unknown as { __judgeLeaked: unknown }).__judgeLeaked = leaked;
    for (let i = 0; i < 40; i++) {
      const canvas = document.createElement("canvas");
      document.getElementById("host")?.appendChild(canvas);
      const gl = canvas.getContext("webgl");
      if (!gl) return false;
      for (let f = 0; f < 3; f++) {
        gl.clearColor(i / 40, 0.5, 0.5, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        await new Promise((r) => requestAnimationFrame(r));
      }
      if (lose) gl.getExtension("WEBGL_lose_context")?.loseContext();
      else leaked.push(gl);
      canvas.remove();
    }
    return true;
  }, release);
}

test("S5 · control de entorno: WebGL bien liberado no deja mensajes en la consola", async ({ page }) => {
  const c = watchConsole(page);
  expect(await churnContexts(page, true), "[control] sin WebGL en el navegador del juez, S5 no ejercitaría contextos WebGL").toBe(true);
  await page.waitForTimeout(1_000);
  expect(c.messages.filter((m) => FORBIDDEN.test(m.text)).map((m) => m.text), "[control] el navegador emite mensajes WebGL por sí solo").toEqual([]);
});

test("S5 · control de entorno: una fuga de contextos WebGL sí deja mensajes en la consola", async ({ page }) => {
  const c = watchConsole(page);
  expect(await churnContexts(page, false), "[control] sin WebGL en el navegador del juez").toBe(true);
  await page.waitForTimeout(1_000);
  expect(c.messages.some((m) => FORBIDDEN.test(m.text)), "[control] el entorno no detecta fugas de contextos WebGL: S5 no discriminaría").toBe(true);
});

test(`S5 · ${CYCLES} ciclos mount → ready → unmount sin fugas`, async ({ page }) => {
  const c = watchConsole(page);
  await gotoSpike(page);
  const renderers: (string | null)[] = [];
  for (let i = 0; i < CYCLES; i++) {
    await test.step(`ciclo ${i + 1}`, async () => {
      await mountAndWaitReady(page, i === 0 ? 60_000 : 15_000);
      renderers.push(await page.evaluate(() => (window as unknown as SpikeWindow).__spike.renderer()));
      await unmountAndSettle(page);
    });
  }
  await page.waitForTimeout(500);
  test.info().annotations.push({ type: "info", description: `renderer por ciclo: ${[...new Set(renderers)].join(", ")}` });

  expect.soft(
    c.messages.filter((m) => FORBIDDEN.test(m.text)).map((m) => `${m.type}: ${m.text}`),
    'mensajes de consola con "WebGL" o "context lost"',
  ).toEqual([]);
  expect.soft(await canvasCount(page), "canvas al final").toBe(0);
});
