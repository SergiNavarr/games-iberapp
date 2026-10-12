// JUDGE · run games only (`_dummy-run`, clean-channels): C24 (playable with the keyboard), C25 (mouse and touch with the
// pointer control), C33 (canvas destroyed after the run), C34 (time scale), C35 (difficulty from the DOM) and C36
// (flashes). C24/C25 at the variant's agreed scale (×1 _dummy-run, ×3 clean-channels): the bot collects everything that
// appears (debugRun() / debugTargets()) and answers the review. C34 and C36 run on the raw path, whose handle stays alive
// after `run-end`. C36: games with buildRun get a seed searched in Node with two obstacles less than 500 ms apart that
// the bot then hits; _dummy-run keeps its agreed guarantee (two obstacles at the player's initial x).
import type { Page } from "@playwright/test";
import {
  answerReview,
  botParams,
  captureAnswers,
  debugMotion,
  debugRun,
  expect,
  fastParams,
  findSeed,
  gotoBench,
  instrumentRun,
  loadBuildRun,
  loadMeta,
  logLength,
  RAW_STAGE,
  readLog,
  readRunProbe,
  realParams,
  SEED,
  steerRun,
  test,
  waitForLogEvent,
  waitForState,
  type BuiltRun,
  type ConformanceWindow,
  type DebugRun,
  type InputMode,
  type LogEntry,
  type RawMountOpts,
  type Variant,
} from "./support";

test.skip(({ variant }) => !variant.run, "criterios de juegos con recorrido");

type Result = { completed: boolean; hits: number; total: number; score: number };
const lastPayload = (log: LogEntry[], event: string) => [...log].reverse().find((e) => e.event === event)?.payload;

/** Full game through `mode` at the bot scale: collect everything, then answer every item of the review right. */
async function playAll(page: Page, mode: InputMode) {
  const answers = await captureAnswers(page);
  const from = await logLength(page);
  await steerRun(page, mode, "all");
  await waitForLogEvent(page, "run-end", from, 60_000);
  const segment = (await readLog(page)).slice(from);
  const collect = lastPayload(segment, "collect") as { collected: number; inChannel: number } | undefined;
  await answerReview(page, answers, mode === "mouse" ? "mouse" : mode, () => true);
  await waitForState(page, "result", 10_000);
  return { collect, result: lastPayload(await readLog(page), "complete") as Result | undefined };
}

// ---------- C24, C25 ----------

test("C24 · teclado: con seed fija recolecta todo lo que aparece, clasifica en la revisión y completa", async ({ page, variant }) => {
  test.setTimeout(240_000);
  await gotoBench(page, variant.id, botParams(variant));
  await waitForState(page, "intro");
  await page.getByRole("button", { name: "Empezar", exact: true }).focus();
  await page.keyboard.press("Enter");
  await waitForState(page, "playing");
  const { collect, result } = await playAll(page, "keyboard");
  expect.soft(collect && collect.collected === collect.inChannel, `recolectó todo: ${JSON.stringify(collect)}`).toBe(true);
  expect.soft(result?.completed, `onDone con completed: true (${JSON.stringify(result)})`).toBe(true);
});

test("C25 · mouse: con el control de puntero recolecta todo, clasifica con clics y completa", async ({ page, variant }) => {
  test.setTimeout(240_000);
  await gotoBench(page, variant.id, botParams(variant));
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const { collect, result } = await playAll(page, "mouse");
  expect.soft(collect && collect.collected === collect.inChannel, `recolectó todo: ${JSON.stringify(collect)}`).toBe(true);
  expect.soft(result?.completed, `onDone con completed: true (${JSON.stringify(result)})`).toBe(true);
});

test.describe("C25 · toque", () => {
  test.use({ hasTouch: true });

  test("C25 · toque: con el control de puntero recolecta todo, clasifica con toques y completa", async ({ page, variant }) => {
    test.setTimeout(240_000);
    await gotoBench(page, variant.id, botParams(variant));
    await page.getByRole("button", { name: "Empezar", exact: true }).tap();
    await waitForState(page, "playing");
    const { collect, result } = await playAll(page, "touch");
    expect.soft(collect && collect.collected === collect.inChannel, `recolectó todo: ${JSON.stringify(collect)}`).toBe(true);
    expect.soft(result?.completed, `onDone con completed: true (${JSON.stringify(result)})`).toBe(true);
  });
});

// ---------- C33 ----------

test("C33 · después de onRunEnd, 0 canvas en el documento durante review y result", async ({ page, variant }) => {
  test.setTimeout(240_000);
  await page.addInitScript(instrumentRun);
  await gotoBench(page, variant.id, botParams(variant));
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const answers = await captureAnswers(page);
  const from = await logLength(page);
  await steerRun(page, "keyboard", "all");
  await waitForLogEvent(page, "run-end", from, 60_000);
  await waitForState(page, "review", 10_000);
  expect.soft(await page.evaluate(() => document.querySelectorAll("canvas").length), "canvas al entrar a review").toBe(0);
  await answerReview(page, answers);
  await waitForState(page, "result", 10_000);
  expect.soft(await page.evaluate(() => document.querySelectorAll("canvas").length), "canvas en result").toBe(0);
  const probe = await readRunProbe(page);
  expect(probe.states.map((s) => s.state), "[control] el wrapper pasó por review").toContain("review");
  expect.soft(probe.canvasInReviewOrResult, "canvas vistos con data-state review o result").toEqual([]);
});

// ---------- C34 ----------

async function rawRun(page: Page, opts: RawMountOpts, steer?: { targets: string[]; aimX?: number }) {
  const from = await logLength(page);
  await page.evaluate((o) => (window as unknown as ConformanceWindow).__conformance.raw.mount(o), opts);
  const ready = await waitForLogEvent(page, "ready", from, 60_000);
  if (steer) await steerRun(page, "keyboard", "targets", RAW_STAGE, { targets: steer.targets, aimX: steer.aimX, which: "raw" });
  const end = await waitForLogEvent(page, "run-end", ready, 300_000);
  const log = await readLog(page);
  return { readyT: log[ready].t, endT: log[end].t, run: await debugRun(page, "raw") };
}

const ITEM_FIELDS = ["id", "kind", "type", "x", "arriveAt", "answer", "collected", "resolvedAt"] as const;
const pickItems = (run: DebugRun | null) => (run?.items ?? []).map((it) => Object.fromEntries(ITEM_FIELDS.map((k) => [k, it[k]])));

/** Difficulties whose real duration C34 measures at ×1: calm and fast (G1: 75 and 60 s), or the default. */
async function c34Difficulties(variant: Variant) {
  const meta = await loadMeta(variant);
  const ids = (meta.difficulties ?? []).map((d) => d.id).filter((id) => id === "calm" || id === "fast");
  return ids.length ? ids : [meta.defaultDifficulty ?? "calm"];
}

test("C34 · a ×1 dura debugRun().durationMs (±1 s) de ready a run-end; a ×10 el cronograma observado es idéntico; sin testHooks, timeScale se ignora", async ({ page, variant }) => {
  test.setTimeout(8 * 60_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoBench(page, variant.id, realParams());
  const durations: Record<string, number> = {};
  let calm: Awaited<ReturnType<typeof rawRun>> | null = null;
  for (const difficulty of await c34Difficulties(variant)) {
    const slow = await rawRun(page, { timeScale: 1, difficulty });
    await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.destroy());
    expect(slow.run, `debugRun() en el camino raw después de run-end (${difficulty})`).not.toBeNull();
    const measured = slow.endT - slow.readyT;
    durations[difficulty] = slow.run?.durationMs ?? 0;
    test.info().annotations.push({ type: "info", description: `×1 ${difficulty}: ${Math.round(measured)} ms de ready a run-end; durationMs ${slow.run?.durationMs}` });
    expect.soft(Math.abs(measured - durations[difficulty]), `×1 ${difficulty}: ${Math.round(measured)} ms vs durationMs ${durations[difficulty]}`).toBeLessThanOrEqual(1_000);
    if (!calm) calm = slow;
  }

  // ×10 against the first ×1 run, same seed, difficulty and design (raw-stage is 16:9).
  const difficulty = calm?.run?.difficulty ?? undefined;
  const fast = await rawRun(page, { timeScale: 10, difficulty: difficulty ?? undefined });
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.destroy());
  expect(fast.run, "debugRun() a ×10").not.toBeNull();
  expect.soft(fast.run?.timeScale, "debugRun().timeScale a ×10").toBe(10);
  expect.soft(fast.run?.difficulty, "misma dificultad").toBe(calm?.run?.difficulty);
  expect.soft(fast.run?.layout, "mismo diseño").toBe(calm?.run?.layout);
  expect.soft(fast.run?.spawns, "spawns (cronograma observado) a ×10 = a ×1").toEqual(calm?.run?.spawns);
  expect.soft(pickItems(fast.run), "items (id, kind, type, x, arriveAt, answer, collected, resolvedAt) a ×10 = a ×1").toEqual(pickItems(calm?.run ?? null));

  // Without testHooks, ?timeScale=10 is ignored: the shortest measured difficulty must last its ×1 duration.
  const [shortest] = Object.entries(durations).sort((a, b) => a[1] - b[1]);
  await gotoBench(page, variant.id, { seed: SEED, timeScale: 10 });
  const from = await logLength(page);
  await page.evaluate((d) => (window as unknown as ConformanceWindow).__conformance.raw.mount({ difficulty: d }), shortest[0]);
  const ready = await waitForLogEvent(page, "ready", from, 60_000);
  const end = await waitForLogEvent(page, "run-end", ready, 300_000);
  const log = await readLog(page);
  const measured = log[end].t - log[ready].t;
  test.info().annotations.push({ type: "info", description: `sin testHooks y ?timeScale=10 (${shortest[0]}): ${Math.round(measured)} ms; declarado ${shortest[1]}` });
  expect.soft(Math.abs(measured - shortest[1]), `sin testHooks: ${Math.round(measured)} ms vs ${shortest[1]} ms (×1)`).toBeLessThanOrEqual(1_000);
});

// ---------- C35 ----------

test("C35 · la dificultad elegida en el intro llega al juego (y sin elegir, la default)", async ({ page, variant }) => {
  const meta = await loadMeta(variant);
  const other = meta.difficulties?.find((d) => d.id !== meta.defaultDifficulty);
  expect(other, "[control] meta declara al menos dos dificultades").toBeDefined();

  await gotoBench(page, variant.id, fastParams(variant));
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  expect.soft((await debugRun(page))?.difficulty, "sin elegir: defaultDifficulty").toBe(meta.defaultDifficulty);

  await gotoBench(page, variant.id, fastParams(variant));
  await page.locator(`[data-testid="difficulty-${other?.id}"]`).check();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  expect.soft((await debugRun(page))?.difficulty, `elegida en el intro: ${other?.id}`).toBe(other?.id);
});

// ---------- C36 ----------

type CloseObstacles = { difficulty: string; seed: number; targets: string[]; aimX: number };

/**
 * Games with buildRun: search fast/normal/calm, seeds 1–1000, landscape (raw-stage is 16:9), for two consecutive
 * obstacles arriving less than 500 ms apart, inside the kayak's range and with |Δx| ≤ pickupHalfWidth: the kayak parked
 * at their midpoint (aimX) hits both without moving (any collision half-width ≥ pickupHalfWidth / 2 covers it), so the
 * bot's latency does not matter. null if none (to be escalated, not reworded by the judge).
 */
function closeObstacles(variant: Variant): CloseObstacles | null {
  const buildRun = loadBuildRun(variant);
  for (const difficulty of ["fast", "normal", "calm"]) {
    let targets: string[] = [];
    let aimX = 0;
    const seed = findSeed(buildRun, difficulty, "landscape", (run: BuiltRun) => {
      const k = run.kinematics;
      const obstacles = run.items
        .filter((i) => i.kind === "obstacle" && i.x >= k.playerMinX && i.x <= k.playerMaxX && i.arriveAt >= 3_000)
        .sort((a, b) => a.arriveAt - b.arriveAt);
      for (let i = 1; i < obstacles.length; i++) {
        const [a, b] = [obstacles[i - 1], obstacles[i]];
        const dt = b.arriveAt - a.arriveAt;
        if (dt < 500 && Math.abs(b.x - a.x) <= k.pickupHalfWidth) {
          targets = [a.id, b.id];
          aimX = (a.x + b.x) / 2;
          return true;
        }
      }
      return false;
    });
    if (seed !== null) return { difficulty, seed, targets, aimX };
  }
  return null;
}

async function c36Run(page: Page, variant: Variant, reducedMotion: boolean) {
  if (!variant.hasBuildRun) {
    // _dummy-run (agreed in E1): two obstacles reach the player's initial x less than 500 ms apart, with any seed.
    await gotoBench(page, variant.id, realParams());
    await rawRun(page, { timeScale: 10, reducedMotion });
    return { motion: await debugMotion(page, "raw"), plan: null as CloseObstacles | null };
  }
  const plan = closeObstacles(variant);
  expect(plan, "no hay en las semillas 1–1000 dos obstáculos a menos de 500 ms que el kayak pueda chocar: escalar").not.toBeNull();
  await gotoBench(page, variant.id, botParams(variant, { seed: plan?.seed }));
  await rawRun(page, { timeScale: variant.botScale ?? 1, difficulty: plan?.difficulty, seed: plan?.seed, reducedMotion }, { targets: plan?.targets ?? [], aimX: plan?.aimX });
  return { motion: await debugMotion(page, "raw"), plan };
}

test("C36 · destellos separados ≥ 500 ms en una partida con dos choques a menos de 500 ms", async ({ page, variant }) => {
  test.setTimeout(240_000);
  const { motion, plan } = await c36Run(page, variant, false);
  expect(motion, "debugMotion() en el camino raw").not.toBeNull();
  const collisions = [...(motion?.collisions ?? [])].sort((a, b) => a - b);
  const flashes = [...(motion?.flashes ?? [])].sort((a, b) => a - b);
  test.info().annotations.push({ type: "info", description: `${plan ? `semilla ${plan.seed} ${plan.difficulty}, objetivos ${plan.targets.join(", ")} en x ${plan.aimX}; ` : ""}choques ${JSON.stringify(collisions)}; destellos ${JSON.stringify(flashes)}` });
  const closePair = collisions.some((t, i) => i > 0 && t - collisions[i - 1] < 500);
  expect.soft(closePair, `la partida tiene dos choques a menos de 500 ms: ${JSON.stringify(collisions)}`).toBe(true);
  const gaps = flashes.slice(1).map((t, i) => t - flashes[i]);
  expect.soft(gaps.every((g) => g >= 500), `destellos separados ≥ 500 ms: ${JSON.stringify(flashes)}`).toBe(true);
});

test("C36 · con reducedMotion: 0 destellos y 0 sacudidas, con choques ocurridos", async ({ page, variant }) => {
  test.setTimeout(240_000);
  const { motion } = await c36Run(page, variant, true);
  expect(motion, "debugMotion() en el camino raw").not.toBeNull();
  expect.soft(motion?.collisions.length ?? 0, "choques ocurridos").toBeGreaterThan(0);
  expect.soft(motion?.flashes, "destellos con reducedMotion").toEqual([]);
  expect.soft(motion?.shakes, "sacudidas con reducedMotion").toEqual([]);
});
