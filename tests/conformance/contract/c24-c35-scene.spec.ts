// JUDGE · E2 and G2, scene games only (`_dummy-scene`, water-signs): C24 (keyboard), C25 (mouse and touch), C33
// (canvas destroyed after the observation phase) and C35 (difficulty from the DOM, read through debugScene() instead of
// debugRun()), as agreed with the coordinator. C24: the crosshair is taken to every signal with single arrow presses
// (reading debugScene().crosshair after each), marked with Enter, and the review is answered with the keyboard. C25:
// clicks and taps on the debugTargets() centers of the signals, and the review with clicks and taps. Expected result:
// every signal found, the maximum of the scene module (scoreOf) and total = signals in the scene. water-signs plays
// them in Atento (variant.sceneFullDifficulty: exactly 8 marks), agreed in G2.
import type { Page } from "@playwright/test";
import {
  answerReview,
  debugScene,
  expect,
  fastParams,
  gotoBench,
  instrumentRun,
  loadMeta,
  loadSceneData,
  logLength,
  playScene,
  readLog,
  readRunProbe,
  sceneAnswers,
  sceneZoneIds,
  test,
  waitForLogEvent,
  waitForState,
  type InputMode,
  type LogEntry,
  type Variant,
} from "./support";

test.skip(({ variant }) => !variant.scene, "criterios de juegos de escena (E2)");

type Result = { completed: boolean; hits: number; total: number; score: number };
const lastPayload = (log: LogEntry[], event: string) => [...log].reverse().find((e) => e.event === event)?.payload;

/** Every signal through `mode`, then the review (right answer) through the same mode. Returns the game's result. */
async function playAll(page: Page, variant: Variant, mode: InputMode) {
  if (variant.sceneFullDifficulty) {
    // G2: C24/C25 in the difficulty with no spare mark (water-signs: Atento, exactly as many marks as signals).
    const scene = await debugScene(page);
    expect(scene?.difficulty, "[control] dificultad de la partida").toBe(variant.sceneFullDifficulty);
    expect(scene?.marksLeft, "[control] tantas marcas como señales").toBe(sceneZoneIds(variant, "signal").length);
  }
  const from = await logLength(page);
  await playScene(page, variant, sceneZoneIds(variant, "signal"), mode);
  await waitForLogEvent(page, "run-end", from, 30_000);
  await answerReview(page, sceneAnswers(variant), mode, () => true);
  await waitForState(page, "result", 10_000);
  return lastPayload((await readLog(page)).slice(from), "complete") as Result | undefined;
}

/** C24/C25 bench params: the variant's agreed difficulty (sceneFullDifficulty), else the default. */
const fullParams = (variant: Variant) => fastParams(variant, variant.sceneFullDifficulty ? { difficulty: variant.sceneFullDifficulty } : {});

function expectedFull(variant: Variant): Result {
  const signals = sceneZoneIds(variant, "signal");
  return { completed: true, total: signals.length, ...loadSceneData(variant).scoreOf(signals) };
}

// ---------- C24, C25 ----------

test("C24 · teclado: la mira con flechas hasta cada señal, Enter para marcar, la revisión con teclado y completa", async ({ page, variant }) => {
  test.setTimeout(240_000);
  await gotoBench(page, variant.id, fullParams(variant));
  await waitForState(page, "intro");
  await page.getByRole("button", { name: "Empezar", exact: true }).focus();
  await page.keyboard.press("Enter");
  await waitForState(page, "playing");
  const result = await playAll(page, variant, "keyboard");
  expect.soft(result, "onDone con todas las señales").toEqual(expectedFull(variant));
});

test("C25 · mouse: clics sobre las señales (debugTargets), la revisión con clics y completa", async ({ page, variant }) => {
  test.setTimeout(240_000);
  await gotoBench(page, variant.id, fullParams(variant));
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const result = await playAll(page, variant, "mouse");
  expect.soft(result, "onDone con todas las señales").toEqual(expectedFull(variant));
});

test.describe("C25 · toque", () => {
  test.use({ hasTouch: true });

  test("C25 · toque: toques sobre las señales (debugTargets), la revisión con toques y completa", async ({ page, variant }) => {
    test.setTimeout(240_000);
    await gotoBench(page, variant.id, fullParams(variant));
    await page.getByRole("button", { name: "Empezar", exact: true }).tap();
    await waitForState(page, "playing");
    const result = await playAll(page, variant, "touch");
    expect.soft(result, "onDone con todas las señales").toEqual(expectedFull(variant));
  });
});

// ---------- C33 ----------

test("C33 · después de onRunEnd, 0 canvas en el documento durante review y result", async ({ page, variant }) => {
  test.setTimeout(240_000);
  await page.addInitScript(instrumentRun);
  await gotoBench(page, variant.id, fastParams(variant));
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const from = await logLength(page);
  await playScene(page, variant, sceneZoneIds(variant, "signal"));
  await waitForLogEvent(page, "run-end", from, 30_000);
  await waitForState(page, "review", 10_000);
  expect.soft(await page.evaluate(() => document.querySelectorAll("canvas").length), "canvas al entrar a review").toBe(0);
  await answerReview(page, sceneAnswers(variant));
  await waitForState(page, "result", 10_000);
  expect.soft(await page.evaluate(() => document.querySelectorAll("canvas").length), "canvas en result").toBe(0);
  const probe = await readRunProbe(page);
  expect(probe.states.map((s) => s.state), "[control] el wrapper pasó por review").toContain("review");
  expect.soft(probe.canvasInReviewOrResult, "canvas vistos con data-state review o result").toEqual([]);
});

// ---------- C35 ----------

test("C35 · la dificultad elegida en el intro llega al juego (debugScene().difficulty y sus marcas; sin elegir, la default)", async ({ page, variant }) => {
  const meta = await loadMeta(variant);
  const { MARKS } = loadSceneData(variant);
  const other = meta.difficulties?.find((d) => d.id !== meta.defaultDifficulty);
  expect(other, "[control] meta declara al menos dos dificultades").toBeDefined();

  await gotoBench(page, variant.id, fastParams(variant));
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const byDefault = await debugScene(page);
  expect.soft(byDefault?.difficulty, "sin elegir: defaultDifficulty").toBe(meta.defaultDifficulty);
  expect.soft(byDefault?.marksLeft, `sin elegir: marcas de ${meta.defaultDifficulty} (data.ts MARKS)`).toBe(MARKS[meta.defaultDifficulty ?? ""]);

  await gotoBench(page, variant.id, fastParams(variant));
  await page.locator(`[data-testid="difficulty-${other?.id}"]`).check();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await waitForState(page, "playing");
  const chosen = await debugScene(page);
  expect.soft(chosen?.difficulty, `elegida en el intro: ${other?.id}`).toBe(other?.id);
  expect.soft(chosen?.marksLeft, `elegida en el intro: marcas de ${other?.id} (data.ts MARKS)`).toBe(MARKS[other?.id ?? ""]);
});
