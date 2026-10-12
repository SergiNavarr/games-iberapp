// JUDGE · E1, run games only (`_dummy-run`): C24 (playable with the keyboard), C25 (mouse and touch with the pointer
// control), C33 (canvas destroyed after the run), C34 (time scale), C35 (difficulty from the DOM) and C36 (flashes).
// C24/C25 at ×1 (agreed): the bot collects everything that appears (debugRun() / debugTargets()) and answers the review.
// C34 and C36 run on the raw path, whose handle stays alive after `run-end`.
import type { Page } from "@playwright/test";
import {
  answerReview,
  captureAnswers,
  debugMotion,
  debugRun,
  expect,
  fastParams,
  gotoBench,
  instrumentRun,
  loadMeta,
  logLength,
  readLog,
  readRunProbe,
  realParams,
  steerRun,
  test,
  waitForLogEvent,
  waitForState,
  type ConformanceWindow,
  type DebugRun,
  type InputMode,
  type LogEntry,
  type RawMountOpts,
} from "./support";

test.skip(({ variant }) => !variant.run, "criterios de juegos con recorrido: corren contra _dummy-run");

type Result = { completed: boolean; hits: number; total: number; score: number };
const lastPayload = (log: LogEntry[], event: string) => [...log].reverse().find((e) => e.event === event)?.payload;

/** Full game at ×1 through `mode`: collect everything, then answer every item of the review right. */
async function playAll(page: Page, mode: InputMode) {
  const answers = await captureAnswers(page);
  const from = await logLength(page);
  await steerRun(page, mode, "all");
  await waitForLogEvent(page, "run-end", from, 30_000);
  const segment = (await readLog(page)).slice(from);
  const collect = lastPayload(segment, "collect") as { collected: number; inChannel: number } | undefined;
  await answerReview(page, answers, mode === "mouse" ? "mouse" : mode, () => true);
  await waitForState(page, "result", 10_000);
  return { collect, result: lastPayload(await readLog(page), "complete") as Result | undefined };
}

// ---------- C24, C25 ----------

test("C24 · teclado: con seed fija recolecta todo lo que aparece, clasifica en la revisión y completa", async ({ page, variant }) => {
  await gotoBench(page, variant.id, realParams());
  await waitForState(page, "intro");
  await page.getByRole("button", { name: "Empezar", exact: true }).focus();
  await page.keyboard.press("Enter");
  await waitForState(page, "playing");
  const { collect, result } = await playAll(page, "keyboard");
  expect.soft(collect && collect.collected === collect.inChannel, `recolectó todo: ${JSON.stringify(collect)}`).toBe(true);
  expect.soft(result?.completed, `onDone con completed: true (${JSON.stringify(result)})`).toBe(true);
});

test("C25 · mouse: con el control de puntero recolecta todo, clasifica con clics y completa", async ({ page, variant }) => {
  await gotoBench(page, variant.id, realParams());
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const { collect, result } = await playAll(page, "mouse");
  expect.soft(collect && collect.collected === collect.inChannel, `recolectó todo: ${JSON.stringify(collect)}`).toBe(true);
  expect.soft(result?.completed, `onDone con completed: true (${JSON.stringify(result)})`).toBe(true);
});

test.describe("C25 · toque", () => {
  test.use({ hasTouch: true });

  test("C25 · toque: con el control de puntero recolecta todo, clasifica con toques y completa", async ({ page, variant }) => {
    await gotoBench(page, variant.id, realParams());
    await page.getByRole("button", { name: "Empezar", exact: true }).tap();
    await waitForState(page, "playing");
    const { collect, result } = await playAll(page, "touch");
    expect.soft(collect && collect.collected === collect.inChannel, `recolectó todo: ${JSON.stringify(collect)}`).toBe(true);
    expect.soft(result?.completed, `onDone con completed: true (${JSON.stringify(result)})`).toBe(true);
  });
});

// ---------- C33 ----------

test("C33 · después de onRunEnd, 0 canvas en el documento durante review y result", async ({ page, variant }) => {
  await page.addInitScript(instrumentRun);
  await gotoBench(page, variant.id, realParams());
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const answers = await captureAnswers(page);
  const from = await logLength(page);
  await steerRun(page, "keyboard", "all");
  await waitForLogEvent(page, "run-end", from, 30_000);
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

async function rawRun(page: Page, opts: RawMountOpts) {
  const from = await logLength(page);
  await page.evaluate((o) => (window as unknown as ConformanceWindow).__conformance.raw.mount(o), opts);
  const ready = await waitForLogEvent(page, "ready", from, 60_000);
  const end = await waitForLogEvent(page, "run-end", ready, 60_000);
  const log = await readLog(page);
  return { readyT: log[ready].t, endT: log[end].t, run: await debugRun(page, "raw") };
}

const ITEM_FIELDS = ["id", "kind", "type", "x", "arriveAt", "answer", "collected", "resolvedAt"] as const;
const pickItems = (run: DebugRun | null) => (run?.items ?? []).map((it) => Object.fromEntries(ITEM_FIELDS.map((k) => [k, it[k]])));

test("C34 · a ×1 dura debugRun().durationMs (±1 s) de ready a run-end; a ×10 el cronograma observado es idéntico", async ({ page, variant }) => {
  await gotoBench(page, variant.id, realParams());
  const slow = await rawRun(page, { timeScale: 1 });
  expect(slow.run, "debugRun() en el camino raw después de run-end").not.toBeNull();
  const measured = slow.endT - slow.readyT;
  test.info().annotations.push({ type: "info", description: `×1: ${Math.round(measured)} ms de ready a run-end; durationMs ${slow.run?.durationMs}` });
  expect.soft(Math.abs(measured - (slow.run?.durationMs ?? 0)), `×1: ${Math.round(measured)} ms vs durationMs ${slow.run?.durationMs}`).toBeLessThanOrEqual(1_000);

  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.destroy());
  const fast = await rawRun(page, { timeScale: 10 });
  expect(fast.run, "debugRun() a ×10").not.toBeNull();
  expect.soft(fast.run?.timeScale, "debugRun().timeScale a ×10").toBe(10);
  expect.soft(fast.run?.difficulty, "misma dificultad").toBe(slow.run?.difficulty);
  expect.soft(fast.run?.layout, "mismo diseño").toBe(slow.run?.layout);
  expect.soft(fast.run?.spawns, "spawns (cronograma observado) a ×10 = a ×1").toEqual(slow.run?.spawns);
  expect.soft(pickItems(fast.run), "items (id, kind, type, x, arriveAt, answer, collected, resolvedAt) a ×10 = a ×1").toEqual(pickItems(slow.run));
});

test("C34 · sin testHooks, timeScale se ignora", async ({ page, variant }) => {
  await gotoBench(page, variant.id, realParams());
  const reference = await rawRun(page, { timeScale: 1 });
  const declared = reference.run?.durationMs ?? 0;
  expect(declared, "[control] durationMs de referencia (con testHooks, ×1)").toBeGreaterThan(0);

  await gotoBench(page, variant.id, { seed: 7, timeScale: 10 });
  const from = await logLength(page);
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.mount());
  const ready = await waitForLogEvent(page, "ready", from, 60_000);
  const end = await waitForLogEvent(page, "run-end", ready, 60_000);
  const log = await readLog(page);
  const measured = log[end].t - log[ready].t;
  test.info().annotations.push({ type: "info", description: `sin testHooks y ?timeScale=10: ${Math.round(measured)} ms; declarado ${declared}` });
  expect.soft(Math.abs(measured - declared), `sin testHooks: ${Math.round(measured)} ms vs ${declared} ms (×1)`).toBeLessThanOrEqual(1_000);
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

test("C36 · destellos separados ≥ 500 ms en una partida con dos choques a menos de 500 ms", async ({ page, variant }) => {
  await gotoBench(page, variant.id, realParams());
  await rawRun(page, { timeScale: 10 });
  const motion = await debugMotion(page, "raw");
  expect(motion, "debugMotion() en el camino raw").not.toBeNull();
  const collisions = [...(motion?.collisions ?? [])].sort((a, b) => a - b);
  const flashes = [...(motion?.flashes ?? [])].sort((a, b) => a - b);
  test.info().annotations.push({ type: "info", description: `choques ${JSON.stringify(collisions)}; destellos ${JSON.stringify(flashes)}` });
  const closePair = collisions.some((t, i) => i > 0 && t - collisions[i - 1] < 500);
  expect.soft(closePair, `la partida tiene dos choques a menos de 500 ms: ${JSON.stringify(collisions)}`).toBe(true);
  const gaps = flashes.slice(1).map((t, i) => t - flashes[i]);
  expect.soft(gaps.every((g) => g >= 500), `destellos separados ≥ 500 ms: ${JSON.stringify(flashes)}`).toBe(true);
});

test("C36 · con reducedMotion: 0 destellos y 0 sacudidas, con choques ocurridos", async ({ page, variant }) => {
  await gotoBench(page, variant.id, realParams());
  await rawRun(page, { timeScale: 10, reducedMotion: true });
  const motion = await debugMotion(page, "raw");
  expect(motion, "debugMotion() en el camino raw").not.toBeNull();
  expect.soft(motion?.collisions.length ?? 0, "choques ocurridos").toBeGreaterThan(0);
  expect.soft(motion?.flashes, "destellos con reducedMotion").toEqual([]);
  expect.soft(motion?.shakes, "sacudidas con reducedMotion").toEqual([]);
});
