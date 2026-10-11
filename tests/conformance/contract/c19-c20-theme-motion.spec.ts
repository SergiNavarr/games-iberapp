// JUDGE · C19 (setTheme without remounting) and C20(b) (reducedMotion respected, E1 wording), per `_dummy` variant
// (run games at ×1). C20(a) is in c00-static.spec.ts. C19 reads the pixel at meta.backgroundProbe (logical px, scaled
// to the canvas) from a screenshot, 500 ms after the theme change, and compares it with the new theme's computed --bg2
// (tolerance per channel: TOLERANCE). C20(b): with reducedMotion, debugMotion().active = 0 in 11 samples over 1 s; the
// byte-identical captures only for games with meta.essentialMotion false.
import zlib from "node:zlib";
import type { Page } from "@playwright/test";
import { expect, gotoBench, loadMeta, logLength, readLog, realParams, startGame, STAGE, test, type ConformanceWindow } from "./support";

const TOLERANCE = 2;

/** RGB of a 1×1 PNG (Chromium screenshots: 8-bit RGB or RGBA; with one pixel every filter leaves the bytes as is). */
function pixelOf(png: Buffer): [number, number, number] {
  let offset = 8;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") colorType = data[9];
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`PNG con tipo de color ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}

function hexToRgb(css: string): [number, number, number] {
  const hex = css.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

async function probePixel(page: Page, probe: { x: number; y: number }) {
  const point = await page.evaluate(
    ([sel, px, py]) => {
      const canvas = document.querySelector(sel)?.querySelector("canvas");
      if (!canvas) throw new Error("sin canvas");
      const r = canvas.getBoundingClientRect();
      return { x: Math.floor(r.x + (px * r.width) / canvas.width), y: Math.floor(r.y + (py * r.height) / canvas.height) };
    },
    [STAGE, probe.x, probe.y] as const,
  );
  return pixelOf(await page.screenshot({ clip: { x: point.x, y: point.y, width: 1, height: 1 } }));
}

test("C19 · setTheme sin remontar: mismo canvas, sin ready nuevo y el fondo pasa al --bg2 del tema nuevo en ≤ 500 ms", async ({ page, variant }) => {
  const meta = await loadMeta(variant);
  await gotoBench(page, variant.id, realParams());
  await startGame(page);
  await page.evaluate((sel) => {
    const canvas = document.querySelector(sel)?.querySelector("canvas");
    if (!canvas) throw new Error("sin canvas");
    const r = canvas.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, behavior: "instant" });
    (window as unknown as { __judgeCanvas: Element }).__judgeCanvas = canvas;
  }, STAGE);
  await page.waitForTimeout(300);
  const from = await logLength(page);
  const initial = await page.evaluate(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));

  for (const theme of initial === "dark" ? (["light", "dark"] as const) : (["dark", "light"] as const)) {
    await test.step(`tema ${theme}`, async () => {
      const bg2 = await page.evaluate(async (t) => {
        (window as unknown as ConformanceWindow).__conformance.setTheme(t);
        await new Promise((r) => setTimeout(r, 500));
        return getComputedStyle(document.documentElement).getPropertyValue("--bg2");
      }, theme);
      const pixel = await probePixel(page, meta.backgroundProbe);
      const expected = hexToRgb(bg2);
      const diff = Math.max(...pixel.map((v, i) => Math.abs(v - expected[i])));
      expect.soft(diff, `píxel de la sonda ${JSON.stringify(pixel)} vs --bg2 ${bg2.trim()} ${JSON.stringify(expected)}`).toBeLessThanOrEqual(TOLERANCE);
      const same = await page.evaluate((sel) => {
        const saved = (window as unknown as { __judgeCanvas: Element }).__judgeCanvas;
        return saved.isConnected && document.querySelector(sel)?.querySelector("canvas") === saved;
      }, STAGE);
      expect.soft(same, "el canvas es el mismo elemento y sigue en el DOM").toBe(true);
    });
  }
  const readyAfter = (await readLog(page)).slice(from).filter((e) => e.event === "ready");
  expect.soft(readyAfter.length, "ready después de cambiar el tema").toBe(0);
});

/** debugMotion().active sampled in the page every 100 ms, 11 samples (1 s). null if the hook is missing. */
function sampleActive(page: Page): Promise<number[] | null> {
  return page.evaluate(async () => {
    const out: number[] = [];
    for (let i = 0; i < 11; i++) {
      const motion = (window as unknown as ConformanceWindow).__conformance.handle()?.debugMotion?.();
      if (!motion) return null;
      out.push(motion.active);
      if (i < 10) await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  });
}

async function playingInView(page: Page) {
  await startGame(page);
  await page.locator(STAGE).locator("canvas").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
}

test("C20(b) · con reducedMotion, en playing y sin input: 0 efectos no esenciales activos durante 1 s (y capturas idénticas sin movimiento esencial)", async ({ page, variant }) => {
  const meta = await loadMeta(variant);

  // [control] without reducedMotion the same game reports some non-essential effect, else "0 active" proves nothing.
  await gotoBench(page, variant.id, realParams({ reducedMotion: false }));
  await playingInView(page);
  const moving = await sampleActive(page);
  expect(moving, "debugMotion() con testHooks").not.toBeNull();
  expect(Math.max(...(moving ?? [0])), `[control] sin reducedMotion no hay efectos no esenciales activos: ${JSON.stringify(moving)}`).toBeGreaterThan(0);

  await gotoBench(page, variant.id, realParams({ reducedMotion: true }));
  await playingInView(page);
  const still = await sampleActive(page);
  expect.soft(still, "debugMotion().active con reducedMotion, 11 muestras en 1 s").toEqual(Array(11).fill(0));

  if (meta.essentialMotion === false) {
    const canvas = page.locator(STAGE).locator("canvas");
    const first = await canvas.screenshot();
    await page.waitForTimeout(1_000);
    const second = await canvas.screenshot();
    expect.soft(first.equals(second), `essentialMotion: false y capturas distintas (${first.length} y ${second.length} bytes)`).toBe(true);
  }
});
