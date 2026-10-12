// JUDGE · C05 (destroy() idempotent) and C06 (destroy() before boot = S4 + no callback after destroy), through the raw
// path and the React path (setMounted(false) during loading), for each `_dummy` variant (run games at ×1). C06 runs
// every case with the module cold and preloaded.
import type { Page } from "@playwright/test";
import {
  callbacksAfterDestroy,
  canvasCount,
  expect,
  gotoBench,
  realParams,
  test,
  logLength,
  readLog,
  startGame,
  waitForLogEvent,
  waitForState,
  watchConsole,
  type ConformanceWindow,
} from "./support";

const DELAYS = [0, 10, 100] as const;
const LATE_WINDOW_MS = 2_000;

test.beforeAll(async ({ browser, variant }, testInfo) => {
  // Warm the dev server (compile the bench and the game chunk) so "cold" means a cold browser, not a compiling server.
  const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
  await gotoBench(page, variant.id, realParams());
  await startGame(page, 120_000);
  await page.close();
});

async function destroyTwice(page: Page, which: "raw" | "react") {
  return page.evaluate((w) => {
    const c = (window as unknown as ConformanceWindow).__conformance;
    const h = w === "raw" ? c.raw.handle() : c.handle();
    if (!h) return "sin handle";
    try {
      h.destroy();
      h.destroy();
      return "ok";
    } catch (e) {
      return `excepción: ${String(e)}`;
    }
  }, which);
}

test("C05 · raw: destroy() dos veces seguidas con el juego andando", async ({ page, variant }) => {
  const c = watchConsole(page, variant.assetBase);
  await gotoBench(page, variant.id, realParams());
  const from = await logLength(page);
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.mount());
  await waitForLogEvent(page, "ready", from, 60_000);
  expect.soft(await destroyTwice(page, "raw"), "destroy() ×2").toBe("ok");
  await page.waitForTimeout(500);
  expect.soft(await canvasCount(page), "canvas").toBe(0);
  expect.soft(c.pageErrors, "pageerror").toEqual([]);
});

test("C05 · React: destroy() dos veces seguidas en playing, y otra vez al desmontar", async ({ page, variant }) => {
  const c = watchConsole(page, variant.assetBase);
  await gotoBench(page, variant.id, realParams());
  await startGame(page);
  expect.soft(await destroyTwice(page, "react"), "destroy() ×2").toBe("ok");
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.setMounted(false));
  await page.waitForTimeout(500);
  expect.soft(await canvasCount(page), "canvas").toBe(0);
  expect.soft(c.pageErrors, "pageerror").toEqual([]);
});

test("C05 · React: en loading, setMounted(false) y después destroy() dos veces más", async ({ page, variant }) => {
  const c = watchConsole(page, variant.assetBase);
  await gotoBench(page, variant.id, realParams());
  await waitForState(page, "intro");
  const r = await page.evaluate(async () => {
    const c = (window as unknown as ConformanceWindow).__conformance;
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Empezar");
    if (!button) return { outcome: "sin botón Empezar", readyBefore: false };
    button.click();
    const end = performance.now() + 5_000;
    while (!c.handle() && performance.now() < end) await new Promise((res) => setTimeout(res, 0));
    const h = c.handle();
    if (!h) return { outcome: "sin handle después de Empezar", readyBefore: false };
    const readyBefore = c.log.some((e) => e.event === "ready");
    c.setMounted(false);
    try {
      h.destroy();
      h.destroy();
      return { outcome: "ok", readyBefore };
    } catch (e) {
      return { outcome: `excepción: ${String(e)}`, readyBefore };
    }
  });
  test.info().annotations.push({ type: "info", description: `ready antes del desmontaje: ${r.readyBefore}` });
  expect.soft(r.outcome, "destroy() ×2 después de setMounted(false)").toBe("ok");
  await page.waitForTimeout(500);
  expect.soft(await canvasCount(page), "canvas").toBe(0);
  expect.soft(c.pageErrors, "pageerror").toEqual([]);
});

for (const warm of [false, true]) {
  for (const via of ["raw", "react"] as const) {
    for (const delay of DELAYS) {
      const label = via === "raw" ? "raw.mount()/raw.destroy()" : 'Empezar/setMounted(false)';
      test(`C06 · ${label} a los ${delay} ms · módulo ${warm ? "precargado" : "en frío"}`, async ({ page, variant }) => {
        const c = watchConsole(page, variant.assetBase);
        await gotoBench(page, variant.id, realParams());
        await waitForState(page, "intro");
        if (warm) await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.importOnly());

        const r = await page.evaluate(
          async ([v, d]) => {
            const conf = (window as unknown as ConformanceWindow).__conformance;
            const t0 = performance.now();
            if (v === "raw") conf.raw.mount();
            else [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Empezar")?.click();
            const callIndex = await new Promise<number>((resolve) =>
              setTimeout(() => {
                const index = conf.log.length;
                if (v === "raw") conf.raw.destroy();
                else conf.setMounted(false);
                resolve(index);
              }, d),
            );
            await new Promise((res) => setTimeout(res, Math.max(0, 500 - (performance.now() - t0))));
            return { callIndex, canvasAt500: document.querySelectorAll("canvas").length, checkedAt: Math.round(performance.now() - t0) };
          },
          [via, delay] as const,
        );

        await page.waitForTimeout(LATE_WINDOW_MS);
        const log = await readLog(page);
        const late = callbacksAfterDestroy(log, r.callIndex);
        test.info().annotations.push({
          type: "info",
          description:
            `canvas a los ${r.checkedAt} ms: ${r.canvasAt500}; a los ~${r.checkedAt + LATE_WINDOW_MS} ms: ${await canvasCount(page)}; ` +
            `destroyed tras la llamada: ${late.destroyedLogged}; log: ${log.map((e) => e.event).join(", ")}`,
        });
        expect.soft(r.canvasAt500, "canvas a los 500 ms del montaje").toBe(0);
        expect.soft(late.offending.map((e) => `${e.i}: ${e.event}`), "callbacks después de destroy()").toEqual([]);
        expect.soft(c.pageErrors, "pageerror").toEqual([]);
        expect.soft(c.errors(), "console.error (sin los 404 de assetBase)").toEqual([]);
      });
    }
  }
}
