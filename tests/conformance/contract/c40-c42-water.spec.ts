// JUDGE · G2, water-signs only: C40 (zones, Node), C41 (score: the 8 signals give 185 in the three difficulties in
// the browser; in Node, points per signal = the specification's table and scoreOf with only distractors = 0) and C42
// (empty water is free with keyboard, mouse and touch; plus, agreed in G2: an already marked element does nothing, and a
// vertical swipe that starts over a zone scrolls and does not mark). Ids, kinds and points come from the
// specification's tables; zones, marks and crosshair from lib/games/water-signs/hotspots.ts (provisional coordinates
// until scene.webp exists: C40, C41 in the browser and C42 are re-run with the real ones).
import type { Page } from "@playwright/test";
import { cdpSwipe, scrollAfter, scrollY } from "../spike/support";
import {
  answerReview,
  CALLBACK_EVENTS,
  centerStage,
  debugScene,
  expect,
  fastParams,
  gotoBench,
  loadMeta,
  loadRawScene,
  logLength,
  moveCrosshair,
  playScene,
  readLog,
  sceneAnswers,
  sceneZoneIds,
  STAGE,
  startGame,
  test,
  waitForLogEvent,
  waitForState,
  WATER_VARIANT,
  type LogEntry,
} from "./support";

test.skip(({ variant }) => variant.id !== WATER_VARIANT.id, "criterios propios de water-signs (G2)");

const SPEC_POINTS: Record<string, number> = {
  "dead-fish": 40,
  "oil-sheen": 30,
  "bottom-bubbling": 25,
  "persistent-foam": 25,
  "dead-vegetation": 20,
  "algae-bloom": 20,
  "buried-waste": 15,
  "murky-patch": 10,
};
const SPEC_DISTRACTORS = ["tannin-water", "camalote", "irupe", "caiman", "capybara", "sunken-log", "stirred-mud"];
const SPEC_MAX = 185;
const BOUNDS = { width: 720, height: 900 };
const MIN_R = 48;
const MIN_GAP = 16;

type Zone = { id: string; kind: string; x: number; y: number; r: number };
type Point = { x: number; y: number };
type Result = { completed: boolean; hits: number; total: number; score: number };
const lastComplete = (log: LogEntry[]) => [...log].reverse().find((e) => e.event === "complete")?.payload as Result | undefined;
const sorted = (a: string[]) => [...a].sort();

// ---------- C40 ----------

test("C40 · zonas (Node): 15 (8 señales y 7 distractores con los ids de la especificación, sin repetir), círculo entero dentro de 720 × 900, r ≥ 48 y ≥ 16 entre bordes", () => {
  const zones = (loadRawScene(WATER_VARIANT).ZONES ?? []) as Zone[];
  const ids = zones.map((z) => z.id);
  expect.soft(ids.length, "cantidad de zonas").toBe(15);
  expect.soft(ids.filter((id, i) => ids.indexOf(id) !== i), "ids repetidos").toEqual([]);
  expect.soft(sorted(zones.filter((z) => z.kind === "signal").map((z) => z.id)), 'ids con kind "signal" = las 8 señales de la especificación').toEqual(sorted(Object.keys(SPEC_POINTS)));
  expect.soft(sorted(zones.filter((z) => z.kind === "distractor").map((z) => z.id)), 'ids con kind "distractor" = los 7 distractores de la especificación').toEqual(sorted(SPEC_DISTRACTORS));
  expect.soft(zones.filter((z) => z.kind !== "signal" && z.kind !== "distractor").map((z) => `${z.id}: ${z.kind}`), "kinds fuera de signal / distractor").toEqual([]);
  const outside = zones.filter((z) => z.x - z.r < 0 || z.x + z.r > BOUNDS.width || z.y - z.r < 0 || z.y + z.r > BOUNDS.height);
  expect.soft(outside.map((z) => `${z.id} (${z.x}, ${z.y}) r ${z.r}`), "zonas que se salen de 720 × 900").toEqual([]);
  expect.soft(zones.filter((z) => !(z.r >= MIN_R)).map((z) => `${z.id}: r ${z.r}`), `zonas con r < ${MIN_R}`).toEqual([]);
  const tight: string[] = [];
  for (let i = 0; i < zones.length; i++)
    for (let j = i + 1; j < zones.length; j++) {
      const [a, b] = [zones[i], zones[j]];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
      if (gap < MIN_GAP) tight.push(`${a.id} ↔ ${b.id}: ${gap.toFixed(1)} px`);
    }
  expect.soft(tight, `pares de zonas con menos de ${MIN_GAP} px entre bordes`).toEqual([]);
});

// ---------- C41 ----------

test("C41 · puntaje (Node): puntos por señal = tabla de la especificación; scoreOf de las 8 señales = 8 y 185; scoreOf con solo distractores (los 7 y cada uno) = 0 y 0", () => {
  const raw = loadRawScene(WATER_VARIANT);
  expect(Object.values(SPEC_POINTS).reduce((s, p) => s + p, 0), "[control] la tabla de la especificación suma 185").toBe(SPEC_MAX);
  expect(raw.POINTS, "[control] hotspots.ts exporta POINTS").toBeDefined();
  expect(typeof raw.scoreOf, "[control] hotspots.ts exporta scoreOf").toBe("function");
  const points = raw.POINTS ?? {};
  expect.soft(Object.fromEntries(Object.keys(SPEC_POINTS).map((id) => [id, points[id]])), "POINTS de cada señal").toEqual(SPEC_POINTS);
  expect.soft(Object.fromEntries(SPEC_DISTRACTORS.map((id) => [id, points[id] ?? 0])), "POINTS de los distractores (ausentes o 0)").toEqual(Object.fromEntries(SPEC_DISTRACTORS.map((id) => [id, 0])));
  const scoreOf = raw.scoreOf as (ids: string[]) => { hits: number; score: number };
  expect.soft(scoreOf(Object.keys(SPEC_POINTS)), "scoreOf(las 8 señales)").toEqual({ hits: 8, score: SPEC_MAX });
  expect.soft(scoreOf(SPEC_DISTRACTORS), "scoreOf(los 7 distractores)").toEqual({ hits: 0, score: 0 });
  for (const id of SPEC_DISTRACTORS) expect.soft(scoreOf([id]), `scoreOf([${id}])`).toEqual({ hits: 0, score: 0 });
});

test("C41 · en las tres dificultades, marcar las 8 señales da { completed: true, hits: 8, total: 8, score: 185 }", async ({ page, variant }) => {
  test.setTimeout(300_000);
  const meta = await loadMeta(variant);
  const difficulties = (meta.difficulties ?? []).map((d) => d.id);
  expect(difficulties, "[control] las tres dificultades de la especificación").toEqual(["calm", "normal", "fast"]);
  for (const [i, difficulty] of difficulties.entries()) {
    await test.step(difficulty, async () => {
      await gotoBench(page, variant.id, fastParams(variant, { difficulty }));
      await startGame(page);
      expect((await debugScene(page))?.difficulty, `[control] dificultad ${difficulty} en el juego`).toBe(difficulty);
      const from = await logLength(page);
      await playScene(page, variant, sceneZoneIds(variant, "signal"), "mouse");
      await waitForLogEvent(page, "run-end", from, 30_000);
      // The review does not score: right answer in calm and fast, wrong in normal.
      await answerReview(page, sceneAnswers(variant), "mouse", () => i % 2 === 0);
      await waitForState(page, "result", 10_000);
      const result = lastComplete((await readLog(page)).slice(from));
      expect.soft(result, `result en ${difficulty}`).toEqual({ completed: true, hits: 8, total: 8, score: SPEC_MAX });
    });
  }
});

// ---------- C42 ----------

const edgeGap = (p: Point, zones: Zone[]) => Math.min(...zones.map((z) => Math.hypot(p.x - z.x, p.y - z.y) - z.r));

/** Empty points for the crosshair: on its grid (start ± k·step), the closest to the start clear of every zone by ≥ 40 px, and one just outside a zone (8–20 px from its edge). */
function keyboardEmptyPoints() {
  const raw = loadRawScene(WATER_VARIANT);
  const zones = (raw.ZONES ?? []) as Zone[];
  const { startX, startY, step } = raw.CROSSHAIR as { startX: number; startY: number; step: number };
  const { width, height } = raw.SCENE as { width: number; height: number };
  const grid: (Point & { gap: number; cost: number })[] = [];
  for (let i = -Math.ceil(width / step); i <= Math.ceil(width / step); i++)
    for (let j = -Math.ceil(height / step); j <= Math.ceil(height / step); j++) {
      const p = { x: startX + i * step, y: startY + j * step };
      if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) grid.push({ ...p, gap: edgeGap(p, zones), cost: Math.abs(i) + Math.abs(j) });
    }
  const byCost = (a: { cost: number }, b: { cost: number }) => a.cost - b.cost;
  return { far: grid.filter((p) => p.gap >= 40).sort(byCost)[0], near: grid.filter((p) => p.gap >= 8 && p.gap <= 20).sort(byCost)[0] };
}

/** Empty points for the pointer: the point of a 10 px grid farthest from every zone, and one at r + 12 from a zone's center. */
function pointerEmptyPoints() {
  const raw = loadRawScene(WATER_VARIANT);
  const zones = (raw.ZONES ?? []) as Zone[];
  const { width, height } = raw.SCENE as { width: number; height: number };
  const inside = (p: Point) => p.x >= 24 && p.x <= width - 24 && p.y >= 24 && p.y <= height - 24;
  let far: (Point & { gap: number }) | null = null;
  for (let x = 24; x <= width - 24; x += 10)
    for (let y = 24; y <= height - 24; y += 10) {
      const gap = edgeGap({ x, y }, zones);
      if (!far || gap > far.gap) far = { x, y, gap };
    }
  let near: (Point & { zone: string }) | null = null;
  for (const z of zones) {
    for (let k = 0; k < 16 && !near; k++) {
      const a = (k * Math.PI) / 8;
      const p = { x: z.x + (z.r + 12) * Math.cos(a), y: z.y + (z.r + 12) * Math.sin(a) };
      if (inside(p) && edgeGap(p, zones) >= 8) near = { ...p, zone: z.id };
    }
    if (near) break;
  }
  return { far, near };
}

/** CSS (viewport) position of a scene point: debugScene().view is relative to the stage, like debugTargets(). */
async function cssOf(page: Page, p: Point) {
  const [scene, box] = await Promise.all([debugScene(page), page.locator(STAGE).boundingBox()]);
  if (!scene || !box) throw new Error("sin debugScene() o sin escenario");
  return { x: box.x + scene.view.left + p.x * scene.view.scale, y: box.y + scene.view.top + p.y * scene.view.scale };
}

/** Runs `act` and returns the callback events it produced within 500 ms and the marks left before and after. */
async function observe(page: Page, act: () => Promise<void>) {
  const from = await logLength(page);
  const before = (await debugScene(page))?.marksLeft ?? null;
  await act();
  await page.waitForTimeout(500);
  const events = (await readLog(page))
    .slice(from)
    .filter((e) => CALLBACK_EVENTS.includes(e.event))
    .map((e) => `${e.event} ${JSON.stringify(e.payload ?? "")}`);
  return { events, before, after: (await debugScene(page))?.marksLeft ?? null };
}

function expectFree(o: Awaited<ReturnType<typeof observe>>, where: string) {
  expect.soft(o.events, `${where}: eventos de callback`).toEqual([]);
  expect.soft(o.after, `${where}: marcas restantes`).toBe(o.before);
}

/** [control] the same input mode does mark a zone (else "no events" proves nothing). */
function expectMarked(o: Awaited<ReturnType<typeof observe>>, where: string) {
  expect(o.events.some((e) => e.startsWith("counter")), `[control] ${where}: la marca no emitió counter (${o.events.join("; ")})`).toBe(true);
  expect(o.after, `[control] ${where}: marcas restantes`).toBe((o.before ?? 0) - 1);
}

async function firstUnmarkedDistractor(page: Page) {
  const zone = (await debugScene(page))?.zones.find((z) => z.kind === "decoy" && !z.marked);
  if (!zone) throw new Error("no queda ningún distractor sin marcar");
  return zone;
}

test("C42 · teclado: Enter y Espacio sobre agua vacía no gastan marcas ni emiten eventos; sobre un elemento ya marcado, tampoco", async ({ page, variant }) => {
  test.setTimeout(240_000);
  const { far, near } = keyboardEmptyPoints();
  expect(far && near, "[control] puntos vacíos en la grilla de la mira").toBeTruthy();
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  await centerStage(page);
  for (const [label, p] of [
    ["lejos de toda zona", far!],
    ["justo afuera de una zona", near!],
  ] as const) {
    await moveCrosshair(page, p.x, p.y);
    for (const key of ["Enter", "Space"]) expectFree(await observe(page, () => page.keyboard.press(key)), `${key} en (${p.x}, ${p.y}), ${label} (a ${p.gap.toFixed(0)} px del borde más cercano)`);
  }
  const zone = await firstUnmarkedDistractor(page);
  await moveCrosshair(page, zone.x, zone.y);
  expectMarked(await observe(page, () => page.keyboard.press("Enter")), `Enter sobre ${zone.id}`);
  for (const key of ["Enter", "Space"]) expectFree(await observe(page, () => page.keyboard.press(key)), `${key} otra vez sobre ${zone.id}, ya marcado`);
});

test("C42 · mouse: clic en agua vacía no gasta marcas ni emite eventos; sobre un elemento ya marcado, tampoco", async ({ page, variant }) => {
  test.setTimeout(240_000);
  const { far, near } = pointerEmptyPoints();
  expect(far && near, "[control] puntos vacíos para el puntero").toBeTruthy();
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  await centerStage(page);
  await page.waitForTimeout(250);
  for (const [label, p] of [
    [`lejos de toda zona (a ${far?.gap.toFixed(0)} px)`, far!],
    [`a r + 12 de ${near?.zone}`, near!],
  ] as const) {
    const c = await cssOf(page, p);
    expectFree(await observe(page, () => page.mouse.click(c.x, c.y)), `clic en (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), ${label}`);
  }
  const zone = await firstUnmarkedDistractor(page);
  const c = await cssOf(page, zone);
  expectMarked(await observe(page, () => page.mouse.click(c.x, c.y)), `clic sobre ${zone.id}`);
  expectFree(await observe(page, () => page.mouse.click(c.x, c.y)), `clic otra vez sobre ${zone.id}, ya marcado`);
});

test.describe("C42 · toque", () => {
  test.use({ hasTouch: true });

  test("C42 · toque: tocar agua vacía no gasta marcas ni emite eventos; sobre un elemento ya marcado, tampoco", async ({ page, variant }) => {
    test.setTimeout(240_000);
    const { far, near } = pointerEmptyPoints();
    expect(far && near, "[control] puntos vacíos para el puntero").toBeTruthy();
    await gotoBench(page, variant.id, fastParams(variant));
    await startGame(page);
    await centerStage(page);
    await page.waitForTimeout(250);
    for (const [label, p] of [
      [`lejos de toda zona (a ${far?.gap.toFixed(0)} px)`, far!],
      [`a r + 12 de ${near?.zone}`, near!],
    ] as const) {
      const c = await cssOf(page, p);
      expectFree(await observe(page, () => page.touchscreen.tap(c.x, c.y)), `toque en (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), ${label}`);
    }
    const zone = await firstUnmarkedDistractor(page);
    const c = await cssOf(page, zone);
    expectMarked(await observe(page, () => page.touchscreen.tap(c.x, c.y)), `toque sobre ${zone.id}`);
    expectFree(await observe(page, () => page.touchscreen.tap(c.x, c.y)), `toque otra vez sobre ${zone.id}, ya marcado`);
  });
});

test.describe("C42 · deslizamiento en celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("C42 · un deslizamiento vertical que empieza sobre una zona scrollea la página y no marca", async ({ page, variant }) => {
    test.setTimeout(240_000);
    await gotoBench(page, variant.id, fastParams(variant));
    await startGame(page);
    await centerStage(page);
    await page.waitForTimeout(300);
    const scene = await debugScene(page);
    expect(scene, "[control] debugScene()").not.toBeNull();
    // The unmarked zone closest to the scene's vertical middle: room for the swipe on both sides.
    const zone = [...(scene?.zones ?? [])].filter((z) => !z.marked).sort((a, b) => Math.abs(a.y - 450) - Math.abs(b.y - 450))[0];
    const c = await cssOf(page, zone);
    const before = await scrollY(page);
    const o = await observe(page, () => cdpSwipe(page, c.x, c.y, c.y - 150));
    test.info().annotations.push({ type: "info", description: `deslizamiento desde ${zone.id} (${c.x.toFixed(0)}, ${c.y.toFixed(0)}) 150 px hacia arriba; scrollY antes ${before}` });
    expect.soft(await scrollAfter(page, before), `scrollY después del deslizamiento sobre ${zone.id} (antes ${before})`).toBeGreaterThan(before);
    expectFree(o, `deslizamiento vertical que empieza sobre ${zone.id}`);
  });
});
