// JUDGE · S4: raw.mount() + raw.destroy() at 0, 10 and 100 ms, and the same with mount()/unmount(): 0 pageerror,
// 0 console.error (except the 404 of missing.webp), 0 canvas at 500 ms (counted from the mount call), no `ready` after
// `destroyed`. Each case runs twice: with the Phaser module cold (fresh browser context) and warm (after one full
// mount → ready → unmount), so the destroy lands both while import() is pending and while Phaser is booting.
import { expect, test } from "@playwright/test";
import {
  canvasCount,
  gotoSpike,
  mountAndWaitReady,
  readLog,
  readyAfterDestroy,
  unmountAndSettle,
  watchConsole,
  type SpikeWindow,
} from "./support";

const DELAYS = [0, 10, 100] as const;
const PATHS = ["raw", "react"] as const;
// Extra observation window after the 500 ms check, to catch a late `ready` from a destroyed instance.
const LATE_READY_WINDOW_MS = 2_000;

test.beforeAll(async ({ browser }, testInfo) => {
  // Warm the dev server (compile /spike and the Phaser chunk) so "cold" means cold browser, not a compiling server.
  const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
  await gotoSpike(page);
  await mountAndWaitReady(page, 120_000);
  await unmountAndSettle(page);
  await page.close();
});

for (const warm of [false, true]) {
  for (const via of PATHS) {
    for (const delay of DELAYS) {
      const label = via === "raw" ? "raw.mount()/raw.destroy()" : "mount()/unmount()";
      test(`S4 · ${label} a los ${delay} ms · módulo ${warm ? "precargado" : "en frío"}`, async ({ page }) => {
        const c = watchConsole(page);
        await gotoSpike(page);
        if (warm) {
          await mountAndWaitReady(page);
          await unmountAndSettle(page);
          await page.waitForTimeout(500);
        }

        const r = await page.evaluate(
          async ([v, d]) => {
            const s = (window as unknown as SpikeWindow).__spike;
            const t0 = performance.now();
            if (v === "raw") s.raw.mount();
            else s.mount();
            const callIndex = await new Promise<number>((resolve) =>
              setTimeout(() => {
                const index = s.log.length;
                if (v === "raw") s.raw.destroy();
                else s.unmount();
                resolve(index);
              }, d),
            );
            await new Promise((res) => setTimeout(res, Math.max(0, 500 - (performance.now() - t0))));
            return { callIndex, canvasAt500: document.querySelectorAll("canvas").length, checkedAt: Math.round(performance.now() - t0) };
          },
          [via, delay] as const,
        );

        await page.waitForTimeout(LATE_READY_WINDOW_MS);
        const log = await readLog(page);
        const late = readyAfterDestroy(log, r.callIndex);
        const canvasLater = await canvasCount(page);
        test.info().annotations.push({
          type: "info",
          description:
            `canvas a los ${r.checkedAt} ms: ${r.canvasAt500}; canvas a los ~${r.checkedAt + LATE_READY_WINDOW_MS} ms: ${canvasLater}; ` +
            `destroyed registrado tras la llamada: ${late.destroyedLogged}; log: ${log.map((e) => e.event).join(", ")}`,
        });

        expect.soft(r.canvasAt500, "canvas en la página a los 500 ms del montaje").toBe(0);
        expect.soft(late.offending, "eventos ready después de destroyed").toEqual([]);
        expect.soft(c.pageErrors, "pageerror").toEqual([]);
        expect.soft(c.errors(), "console.error (sin el 404 de missing.webp)").toEqual([]);
      });
    }
  }
}
