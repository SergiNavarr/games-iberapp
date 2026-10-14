// JUDGE · C19 (setTheme without remounting) and C20(b) (reducedMotion respected, E1 wording), per game (run games at
// ×1). C20(a) is in c00-static.spec.ts. C19 reads the pixel at meta.backgroundProbe (logical px, scaled to the canvas)
// from a screenshot, 500 ms after the theme change, and compares it with the new theme's computed --bg2 (tolerance per
// channel: TOLERANCE); clean-channels runs it in both designs (1280 and 390 px). C20(b): with reducedMotion,
// debugMotion().active = 0 in 11 samples over 1 s; the byte-identical captures only for games with essentialMotion
// false. The [control] (without reducedMotion something is active) uses the ambient effect (since G1b also in
// clean-channels: the paddle's stroke), or, for run games without one, a collision with an obstacle: steer to it,
// release the keys, sample around the hit (no current game uses it).
// E2, games that declare meta.stillWithoutInput: the [control] provokes the non-essential transition of a mark (the mark
// is the only input and opens the window: 1 s from its `counter` event); debugMotion() is sampled inside the page every
// ~10 ms from before the key press (the transition lasts ~150 ms).
import zlib from "node:zlib";
import type { Page } from "@playwright/test";
import {
  debugRun,
  debugScene,
  expect,
  gotoBench,
  loadMeta,
  logLength,
  moveCrosshair,
  readLog,
  realParams,
  startGame,
  STAGE,
  test,
  type ConformanceWindow,
} from "./support";

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

for (const viewport of [undefined, { width: 390, height: 844 }]) {
test(`C19 · setTheme sin remontar: mismo canvas, sin ready nuevo y el fondo pasa al --bg2 del tema nuevo en ≤ 500 ms${viewport ? ` · ${viewport.width} px` : ""}`, async ({ page, variant }) => {
  test.skip(!!viewport && !variant.c19Viewports?.some((v) => v.width === viewport.width), "este juego corre C19 solo a 1280 px");
  const meta = await loadMeta(variant);
  if (viewport) await page.setViewportSize(viewport);
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
}

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

/**
 * Games without an ambient effect: steer the player under the next reachable obstacle, release the keys, and sample
 * debugMotion().active from 500 ms (game time) before its arrival (no input during the window). The wait and the 11
 * samples run inside the page (no test↔page round trips that could start the window late), and "collided in the
 * window" means a collision whose game time lies within the game-time range actually sampled.
 */
async function sampleAroundCollision(page: Page) {
  const run = await debugRun(page);
  if (!run) throw new Error("debugRun() devolvió null");
  const k = run.kinematics as typeof run.kinematics & { playerMinX?: number; playerMaxX?: number };
  const target = run.items
    .filter((i) => i.kind === "obstacle" && i.arriveAt - run.elapsedMs >= 2_500)
    .filter((i) => i.x >= (k.playerMinX ?? -Infinity) && i.x <= (k.playerMaxX ?? Infinity))
    .sort((a, b) => a.arriveAt - b.arriveAt)[0];
  if (!target) throw new Error("no hay obstáculo alcanzable con ≥ 2,5 s de margen");
  await page.locator(STAGE).focus();
  for (let i = 0; i < 400; i++) {
    const now = await debugRun(page);
    if (!now) break;
    const dx = target.x - now.player.x;
    if (Math.abs(dx) <= k.pickupHalfWidth * 0.2) break;
    const key = dx < 0 ? "ArrowLeft" : "ArrowRight";
    await page.keyboard.down(key);
    await page.waitForTimeout(20);
    await page.keyboard.up(key);
  }
  const sampled = await page.evaluate(async (arriveAt) => {
    const c = (window as unknown as ConformanceWindow).__conformance;
    const deadline = performance.now() + 20_000;
    while (performance.now() < deadline) {
      const r = c.handle()?.debugRun?.();
      if (!r || r.elapsedMs >= arriveAt - 500) break;
      await new Promise((res) => setTimeout(res, 5));
    }
    const samples: number[] = [];
    const elapsed: number[] = [];
    for (let i = 0; i < 11; i++) {
      const m = c.handle()?.debugMotion?.();
      const r = c.handle()?.debugRun?.();
      if (!m || !r) return null;
      samples.push(m.active);
      elapsed.push(r.elapsedMs);
      if (i < 10) await new Promise((res) => setTimeout(res, 100));
    }
    return { samples, from: elapsed[0], to: elapsed[10], collisions: c.handle()?.debugMotion?.()?.collisions ?? [] };
  }, target.arriveAt);
  const collided = !!sampled && sampled.collisions.some((t: number) => t >= sampled.from && t <= sampled.to);
  return { samples: sampled?.samples ?? null, collided, target: `${target.id} (llega a los ${target.arriveAt} ms; ventana ${sampled ? `${Math.round(sampled.from)}–${Math.round(sampled.to)}` : "?"} ms; choques ${JSON.stringify(sampled?.collisions ?? [])})` };
}

type MarkSample = { t: number; active: number; created: number };

/**
 * stillWithoutInput games: crosshair onto the first unmarked decoy (a mark that does not end the phase), start the
 * in-page sampler, then press Enter. The window is [t of the first `counter` event after the press, +1000 ms].
 */
async function sampleAroundMark(page: Page) {
  const scene = await debugScene(page);
  if (!scene) throw new Error("debugScene() devolvió null");
  const zone = scene.zones.find((z) => !z.marked && z.kind === "decoy") ?? scene.zones.find((z) => !z.marked);
  if (!zone) throw new Error("no queda ninguna zona sin marcar");
  await moveCrosshair(page, zone.x, zone.y);
  const leftBefore = scene.marksLeft;
  const from = await logLength(page);
  const sampling = page.evaluate(async (start) => {
    const w = window as unknown as ConformanceWindow & { __judgeSampling?: boolean };
    const c = w.__conformance;
    const samples: { t: number; active: number; created: number }[] = [];
    let markT: number | null = null;
    w.__judgeSampling = true;
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const m = c.handle()?.debugMotion?.();
      if (!m) break;
      samples.push({ t: performance.now(), active: m.active, created: m.created });
      if (markT === null)
        for (let i = start; i < c.log.length; i++)
          if (c.log[i].event === "counter") {
            markT = c.log[i].t;
            break;
          }
      if (markT !== null && performance.now() >= markT + 1_050) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    w.__judgeSampling = false;
    return { samples, markT };
  }, from);
  await page.waitForFunction(() => (window as unknown as { __judgeSampling?: boolean }).__judgeSampling === true);
  await page.keyboard.press("Enter");
  const { samples, markT } = await sampling;
  const leftAfter = (await debugScene(page))?.marksLeft ?? null;
  const inWindow: MarkSample[] = markT === null ? [] : samples.filter((s) => s.t >= markT && s.t <= markT + 1_000);
  const createdBefore = samples[0]?.created ?? null;
  const createdAfter = samples[samples.length - 1]?.created ?? null;
  return {
    marked: markT !== null && leftAfter === leftBefore - 1,
    where: `${zone.id}; marcas restantes ${leftBefore} → ${leftAfter}; ${inWindow.length} muestras en la ventana; created ${createdBefore} → ${createdAfter}`,
    inWindow,
    createdDelta: createdBefore === null || createdAfter === null ? null : createdAfter - createdBefore,
  };
}

test("C20(b) · con reducedMotion, en playing y sin input: 0 efectos no esenciales activos durante 1 s (y capturas idénticas sin movimiento esencial)", async ({ page, variant }) => {
  test.setTimeout(240_000);
  const meta = await loadMeta(variant);
  const still = meta.stillWithoutInput === true;
  expect(still, "[control] meta.stillWithoutInput coincide con variants.ts").toBe(variant.stillWithoutInput === true);

  // [control] without reducedMotion the same game reports some non-essential effect, else "0 active" proves nothing.
  await gotoBench(page, variant.id, realParams({ reducedMotion: false }));
  await playingInView(page);
  if (still) {
    const control = await sampleAroundMark(page);
    expect(control.marked, `[control] la marca no ocurrió (${control.where})`).toBe(true);
    expect(control.createdDelta ?? 0, `[control] sin reducedMotion la marca no crea un efecto no esencial (${control.where})`).toBeGreaterThanOrEqual(1);
    expect(Math.max(0, ...control.inWindow.map((s) => s.active)), `[control] sin reducedMotion la transición de la marca nunca aparece activa (${control.where})`).toBeGreaterThan(0);
  } else if (variant.ambientMotion === false) {
    const control = await sampleAroundCollision(page);
    expect(control.collided, `[control] el choque con ${control.target} no ocurrió en la ventana`).toBe(true);
    expect(Math.max(...(control.samples ?? [0])), `[control] sin reducedMotion el choque no activa sacudida ni destello: ${JSON.stringify(control.samples)}`).toBeGreaterThan(0);
  } else {
    const moving = await sampleActive(page);
    expect(moving, "debugMotion() con testHooks").not.toBeNull();
    expect(Math.max(...(moving ?? [0])), `[control] sin reducedMotion no hay efectos no esenciales activos: ${JSON.stringify(moving)}`).toBeGreaterThan(0);
  }

  await gotoBench(page, variant.id, realParams({ reducedMotion: true }));
  await playingInView(page);
  if (still) {
    const reduced = await sampleAroundMark(page);
    expect(reduced.marked, `[control] con reducedMotion la marca no ocurrió (${reduced.where})`).toBe(true);
    expect(reduced.inWindow.length, `[control] muestras de debugMotion() en la ventana (${reduced.where})`).toBeGreaterThanOrEqual(20);
    test.info().annotations.push({ type: "info", description: `con reducedMotion: ${reduced.where}` });
    expect.soft(reduced.inWindow.filter((s) => s.active !== 0), `muestras con debugMotion().active ≠ 0 en 1 s desde la marca, con reducedMotion (${reduced.where})`).toEqual([]);
  } else if (variant.ambientMotion === false) {
    const still = await sampleAroundCollision(page);
    expect(still.collided, `[control] con reducedMotion el choque con ${still.target} no ocurrió en la ventana`).toBe(true);
    expect.soft(still.samples, "debugMotion().active con reducedMotion durante el choque, 11 muestras en 1 s").toEqual(Array(11).fill(0));
  } else {
    const still = await sampleActive(page);
    expect.soft(still, "debugMotion().active con reducedMotion, 11 muestras en 1 s").toEqual(Array(11).fill(0));
  }

  if (meta.essentialMotion === false) {
    const canvas = page.locator(STAGE).locator("canvas");
    const first = await canvas.screenshot();
    await page.waitForTimeout(1_000);
    const second = await canvas.screenshot();
    expect.soft(first.equals(second), `essentialMotion: false y capturas distintas (${first.length} y ${second.length} bytes)`).toBe(true);
  }
});
