// JUDGE · C07 (one canvas in Strict Mode, next dev) and C08 (20 mounts without leaks, in /conformance/_dummy).
import { expect, test } from "@playwright/test";
import {
  canvasCount,
  gotoBench,
  instrumentProbe,
  logLength,
  readProbe,
  startButton,
  STAGE,
  waitForLogEvent,
  waitForState,
  watchConsole,
  type ConformanceWindow,
} from "./support";

const FORBIDDEN = /webgl|context lost/i;

test("C07 · un solo canvas en Strict Mode (next dev)", async ({ page }) => {
  await page.addInitScript(instrumentProbe);
  await gotoBench(page);
  await startButton(page).click();
  await waitForState(page, "playing");
  expect.soft(await canvasCount(page, STAGE), "canvas en el escenario en playing").toBe(1);
  await page.waitForTimeout(1_000);
  expect.soft(await canvasCount(page, STAGE), "canvas en el escenario 1 s después").toBe(1);
  const probe = await readProbe(page);
  expect.soft(probe.canvasMax, "máximo simultáneo de canvas en el documento durante la prueba").toBeLessThanOrEqual(1);
});

test("C08 · 20 ciclos de Empezar y desmontar sin fugas", async ({ page }) => {
  const c = watchConsole(page);
  await gotoBench(page);
  for (let i = 0; i < 20; i++) {
    await test.step(`ciclo ${i + 1}`, async () => {
      await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.setMounted(true));
      await waitForState(page, "intro");
      const from = await logLength(page);
      await startButton(page).click();
      await waitForLogEvent(page, "ready", from, i === 0 ? 60_000 : 15_000);
      const before = await logLength(page);
      await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.setMounted(false));
      await waitForLogEvent(page, "destroyed", before, 1_000).catch(() => undefined);
    });
  }
  await page.waitForTimeout(500);
  const forbidden = [
    ...c.messages.filter((m) => (m.type === "warning" || m.type === "error") && FORBIDDEN.test(m.text)).map((m) => `${m.type}: ${m.text}`),
    ...c.pageErrors.filter((e) => FORBIDDEN.test(e)).map((e) => `pageerror: ${e}`),
  ];
  expect.soft(forbidden, 'warning/error/pageerror con "WebGL" o "context lost"').toEqual([]);
  expect.soft(await canvasCount(page), "canvas al final").toBe(0);
});
