// JUDGE · C26 (coherent callbacks, per phase in E1), C27 (valid result), C28 (DOM slots), C29 ("Reportar" goes through
// the landing), C30 (persistence by score) and C32 (clean console), per `_dummy` variant, fixed seed and testHooks.
// Run games: ×10 when only the end matters; the bot at the variant's agreed scale (×1 _dummy-run, ×3 clean-channels)
// when the run must be played (collect all).
// C30: (a) a seeded worse entry is replaced, (b) a tie keeps the latest, (c) pickBest in Node keeps a better stored entry.
// E2 (scene game, meta.hitsFrom "game"): C26 per mark of the canvas (oracle: the kind of the zone in data.ts, never the
// log), the review answered right and wrong in two games, and result = the game's; C28 adds the marker kept in the
// review, the text panel (last announce), the counter (value / max), the empty result by meta.emptyResult.when and the
// panel clear of the stage at 1280 and 390 px.
import type { Page } from "@playwright/test";
import {
  answerReview,
  botParams,
  captureAnswers,
  completeWithKeyboard,
  COUNTER,
  DIFFICULTY,
  emptySeed,
  expect,
  fastParams,
  finishGame,
  gotoBench,
  instrumentRun,
  LIVE,
  loadContract,
  loadGameProgress,
  loadMeta,
  loadSceneData,
  logLength,
  maxTotalOf,
  ONCE_VARIANT,
  playScene,
  RAW_STAGE,
  readLog,
  readRunProbe,
  REVIEW_FEEDBACK,
  RUN_VARIANT,
  runAtEnd,
  hookRunEndSnapshot,
  REVIEW_NEXT,
  REVIEW_OPTION_PREFIX,
  RESULT_EMPTY,
  RESULT_SCORE,
  RESULT_TITLE,
  sceneAnswers,
  sceneZoneIds,
  SCORE,
  SEED,
  STAGE,
  startButton,
  startGame,
  steerRun,
  test,
  TEXT_PANEL,
  waitForLogEvent,
  waitForState,
  watchConsole,
  wrapperState,
  type ConformanceWindow,
  type LogEntry,
  type Variant,
} from "./support";
import { POINTS } from "./spec-clean-channels";

const PROGRESS_KEY = "ibera-games-progress";
const INPUT_SETTLE_MS = 300;

type Progress = { hits: number; total: number };
type Result = { completed: boolean; hits: number; total: number; score: number };
const progressOf = (e: LogEntry) => e.payload as Progress;

/** Single-phase game: one input at a time (Enter; ArrowRight when Enter did not score); log segment of each input. */
async function playByInputs(page: Page, stage = STAGE, maxInputs = 40) {
  await page.locator(stage).focus();
  const segments: { key: string; entries: LogEntry[] }[] = [];
  let lastScored = true;
  for (let i = 0; i < maxInputs; i++) {
    const key = lastScored ? "Enter" : "ArrowRight";
    const from = await logLength(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(INPUT_SETTLE_MS);
    const entries = (await readLog(page)).slice(from);
    segments.push({ key, entries });
    if (key === "Enter") lastScored = entries.some((e) => e.event === "progress");
    else lastScored = true;
    if (entries.some((e) => e.event === "complete")) break;
  }
  return segments;
}

/** Run game at ×1: the bot collects everything, then the review is answered with `choose`. */
async function playRun(page: Page, choose: (i: number) => boolean = () => true) {
  const answers = await captureAnswers(page);
  const from = await logLength(page);
  await steerRun(page, "keyboard", "all");
  await waitForLogEvent(page, "run-end", from, 30_000);
  const answered = await answerReview(page, answers, "keyboard", choose);
  await waitForState(page, "result", 10_000);
  return { from, answered, log: await readLog(page) };
}

const lastComplete = (log: LogEntry[]) => [...log].reverse().find((e) => e.event === "complete")?.payload as Result | undefined;
const norm = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

/** Reads `read()` until `ok` or `timeout` ms (the DOM has 500 ms to catch up with the log); returns the last value. */
async function settle<T>(read: () => Promise<T>, ok: (value: T) => boolean, timeout = 500): Promise<T> {
  const end = Date.now() + timeout;
  let value = await read();
  while (!ok(value) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 25));
    value = await read();
  }
  return value;
}

/**
 * Scene game: marks for a partial game that ends by running out of marks (default difficulty): decoys and signals
 * alternated, starting with a decoy, as many as marks (so not every signal gets found).
 */
function partialSceneMarks(variant: Variant, marks: number) {
  const signals = sceneZoneIds(variant, "signal");
  const decoys = sceneZoneIds(variant, "decoy");
  const out: string[] = [];
  for (let i = 0; out.length < marks && (i < decoys.length || i < signals.length); i++) {
    if (i < decoys.length) out.push(decoys[i]);
    if (out.length < marks && i < signals.length) out.push(signals[i]);
  }
  return { ids: out, signals: out.filter((id) => signals.includes(id)).length, allSignals: signals.length };
}

// ---------- C26 ----------

test("C26 · cada acierto da 1 onProgress (hits + 1) y ≥ 1 announce; onComplete exactamente 1 vez", async ({ page, variant }) => {
  test.skip(variant.run || !!variant.scene, "juego de una fase; los de recorrido y de escena tienen su test por fase");
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  const segments = await playByInputs(page);
  let hits = 0;
  for (const [i, s] of segments.entries()) {
    const progress = s.entries.filter((e) => e.event === "progress");
    if (progress.length === 0) continue;
    expect.soft(progress.length, `input ${i + 1} (${s.key}): onProgress por acierto`).toBe(1);
    expect.soft(progressOf(progress[0]).hits, `input ${i + 1} (${s.key}): hits`).toBe(hits + 1);
    expect.soft(s.entries.filter((e) => e.event === "announce").length, `input ${i + 1} (${s.key}): announce`).toBeGreaterThanOrEqual(1);
    hits = progressOf(progress[0]).hits;
  }
  await page.waitForTimeout(1_000);
  expect.soft((await readLog(page)).filter((e) => e.event === "complete").length, "onComplete").toBe(1);
});

test("C26 · después de onComplete ningún input cambia hits (camino raw, teclado y clics en debugTargets)", async ({ page, variant }) => {
  test.skip(variant.run || !!variant.scene, "juego de una fase (el camino raw de un juego con revisión no la tiene; E2: no aplica a la escena)");
  await gotoBench(page, variant.id, fastParams(variant));
  const from = await logLength(page);
  await page.evaluate((seed) => (window as unknown as ConformanceWindow).__conformance.raw.mount({ seed }), SEED);
  await waitForLogEvent(page, "ready", from, 60_000);
  await completeWithKeyboard(page, RAW_STAGE);
  const after = await logLength(page);

  await page.locator(RAW_STAGE).focus();
  for (const key of ["Enter", "Space", "ArrowRight", "Enter", "ArrowLeft", "Space"]) await page.keyboard.press(key);
  const targets = await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.raw.handle()?.debugTargets?.() ?? null);
  expect(targets, "[control] el handle raw no expone debugTargets() con testHooks").not.toBeNull();
  const box = await page.locator(RAW_STAGE).boundingBox();
  for (const t of targets ?? []) if (box) await page.mouse.click(box.x + t.x, box.y + t.y);
  await page.waitForTimeout(500);

  const later = (await readLog(page)).slice(after);
  expect.soft(later.filter((e) => e.event === "progress"), "onProgress después de onComplete").toEqual([]);
  expect.soft(later.filter((e) => e.event === "complete"), "onComplete repetido").toEqual([]);
});

test("C26 · por fase: cada recolección 1 onCollect (+1) y ≥ 1 announce; en la revisión, acierto 1 onProgress (+1, o + el tamaño del grupo), error 0, siempre ≥ 1 announce; onDone 1 vez", async ({ page, variant }) => {
  test.skip(!variant.run, "juego con recorrido");
  test.setTimeout(240_000);
  await gotoBench(page, variant.id, botParams(variant));
  await startGame(page);
  await hookRunEndSnapshot(page);
  // First answer right, second wrong, the rest right: both review paths get exercised.
  const { from, answered } = await playRun(page, (i) => i !== 1);
  await page.waitForTimeout(1_000);
  const log = await readLog(page);
  const runEnd = log.findIndex((e, i) => i >= from && e.event === "run-end");

  // Run phase.
  const collects = log.map((e, i) => ({ e, i })).filter(({ e, i }) => i < runEnd && e.event === "collect");
  const counted = collects.filter(({ e }, k) => !(k === 0 && (e.payload as { collected: number }).collected === 0));
  const values = counted.map(({ e }) => (e.payload as { collected: number }).collected);
  expect(values.length, "[control] el bot no recolectó al menos 2 objetos: la revisión no ejercita acierto y error").toBeGreaterThanOrEqual(2);
  expect.soft(values, "collected de cada onCollect (1, 2, …, N, una vez cada uno)").toEqual(values.map((_, k) => k + 1));
  counted.forEach(({ i }, k) => {
    const end = k + 1 < counted.length ? counted[k + 1].i : runEnd;
    const announces = log.slice(i + 1, end).filter((e) => e.event === "announce").length;
    expect.soft(announces, `recolección ${k + 1}: announce después de su onCollect`).toBeGreaterThanOrEqual(1);
  });

  // Review phase. G1b E3a (clean-channels): one review-item per group (data-count = n): answer.count = n, a hit adds n,
  // the group's data-item-ids are the collected items of that type (debugRun() at run-end) and the counts add up to
  // the collected units. _dummy-run keeps one item per answer and its answer payload has no count.
  const grouped = answered.some((a) => a.count !== null);
  const end = grouped ? await runAtEnd(page) : null;
  if (grouped) {
    expect(end, "[control] debugRun() en el instante de run-end").not.toBeNull();
    expect(answered.length, "[control] al menos 2 grupos: la revisión no ejercita acierto y error").toBeGreaterThanOrEqual(2);
  }
  let hits = 0;
  let score = 0;
  for (const [k, a] of answered.entries()) {
    const seg = log.slice(a.logFrom, a.logTo);
    const answers = seg.filter((e) => e.event === "answer");
    const progress = seg.filter((e) => e.event === "progress");
    const payload = answers[0]?.payload as { hit?: boolean; count?: number } | undefined;
    const hit = payload?.hit;
    const n = a.count ?? 1;
    const where = `respuesta ${k + 1}${a.count !== null ? ` (grupo ${a.id} × ${a.count})` : ""}`;
    expect.soft(answers.length, `${where}: eventos answer`).toBe(1);
    expect.soft(hit, `${where}: la opción de debugRun().items[].answer cuenta como acierto y otra como error`).toBe(a.wantCorrect);
    expect.soft(seg.filter((e) => e.event === "announce").length, `${where}: announce`).toBeGreaterThanOrEqual(1);
    if (a.count !== null) {
      expect.soft(payload?.count, `${where}: answer.count = data-count`).toBe(a.count);
      const expectedIds = (end?.items ?? []).filter((i) => i.kind === "item" && i.collected && i.type === a.id).map((i) => i.id);
      expect.soft(a.itemIds?.length, `${where}: cantidad de data-item-ids = data-count`).toBe(a.count);
      expect.soft([...(a.itemIds ?? [])].sort(), `${where}: data-item-ids = ítems recolectados de ese tipo (debugRun() en run-end)`).toEqual(expectedIds.sort());
    } else if (variant.id === RUN_VARIANT.id) {
      expect.soft(Object.keys(payload ?? {}).sort(), `${where}: claves del payload de answer (sin count)`).toEqual(["hit", "hits", "total"]);
    }
    if (hit) {
      expect.soft(progress.length, `${where} (acierto): onProgress`).toBe(1);
      if (progress[0]) expect.soft(progressOf(progress[0]).hits, `${where} (acierto): hits`).toBe(hits + n);
      hits += n;
      score += (POINTS[a.id] ?? 0) * n;
    } else expect.soft(progress.length, `${where} (error): onProgress`).toBe(0);
  }
  const completes = log.slice(from).filter((e) => e.event === "complete");
  expect.soft(completes.length, "onDone → complete").toBe(1);
  if (grouped) {
    expect.soft(answered.reduce((sum, a) => sum + (a.count ?? 0), 0), "suma de data-count = unidades recolectadas").toBe(values.length);
    // Agreed in G1b: result in units, with the specification's points per type.
    expect.soft(completes[0]?.payload, "result en unidades: { completed: true, total: recolectados, hits: Σ n acertados, score: Σ puntos(tipo) × n }").toEqual({
      completed: true,
      total: values.length,
      hits,
      score,
    });
  }
});

for (const answer of ["acertada", "errada"] as const)
  test(`C26 · hitsFrom "game": señal 1 onProgress (+1) y ≥ 1 announce; señuelo 0 y ≥ 1 announce; respuesta ${answer} de la revisión 0 onProgress y ≥ 1 announce; onDone 1 vez; result = el del juego`, async ({ page, variant }) => {
    test.skip(!variant.scene, "juego de escena (hitsFrom game)");
    test.setTimeout(240_000);
    const meta = await loadMeta(variant);
    expect(meta.hitsFrom, "[control] meta.hitsFrom").toBe("game");
    const data = loadSceneData(variant);
    const marksLeft = data.MARKS[meta.defaultDifficulty ?? ""];
    const plan = partialSceneMarks(variant, marksLeft);
    expect(plan.ids.length, `[control] la partida gasta las ${marksLeft} marcas de ${meta.defaultDifficulty}`).toBe(marksLeft);
    expect(plan.signals > 0 && plan.signals < plan.allSignals, `[control] partida parcial con señales y señuelos: ${plan.ids.join(", ")}`).toBe(true);

    await gotoBench(page, variant.id, fastParams(variant));
    await startGame(page);
    const from = await logLength(page);
    const segments = await playScene(page, variant, plan.ids, "keyboard");
    await waitForLogEvent(page, "run-end", from, 10_000);
    const answered = await answerReview(page, sceneAnswers(variant), "keyboard", () => answer === "acertada");
    await waitForState(page, "result", 10_000);
    await page.waitForTimeout(500);
    const log = await readLog(page);

    // Canvas phase: one segment per mark.
    let hits = 0;
    for (const [k, s] of segments.entries()) {
      const entries = log.slice(s.logFrom, s.logTo);
      const progress = entries.filter((e) => e.event === "progress");
      const where = `marca ${k + 1} (${s.id}, ${s.kind === "signal" ? "señal" : "señuelo"})`;
      if (s.kind === "signal") {
        expect.soft(progress.length, `${where}: onProgress`).toBe(1);
        if (progress[0]) expect.soft(progressOf(progress[0]).hits, `${where}: hits`).toBe(hits + 1);
        hits++;
      } else expect.soft(progress.length, `${where}: onProgress`).toBe(0);
      expect.soft(entries.filter((e) => e.event === "announce").length, `${where}: announce`).toBeGreaterThanOrEqual(1);
    }

    // Review: does not score.
    expect(answered.length, "[control] la revisión tuvo al menos una respuesta").toBeGreaterThan(0);
    for (const [k, a] of answered.entries()) {
      const seg = log.slice(a.logFrom, a.logTo);
      expect(a.wantCorrect, `[control] respuesta ${k + 1} ${answer}`).toBe(answer === "acertada");
      expect.soft(seg.filter((e) => e.event === "progress").length, `respuesta ${k + 1} (${a.chose}): onProgress`).toBe(0);
      expect.soft(seg.filter((e) => e.event === "announce").length, `respuesta ${k + 1} (${a.chose}): announce`).toBeGreaterThanOrEqual(1);
    }

    // onDone exactly once, and its result is the game's: scoreOf(marked) from data.ts, total = signals in the scene.
    const completes = log.slice(from).filter((e) => e.event === "complete");
    expect.soft(completes.length, "onDone → complete").toBe(1);
    const expected = { completed: true, total: plan.allSignals, ...data.scoreOf(plan.ids) };
    test.info().annotations.push({ type: "info", description: `marcadas ${plan.ids.join(", ")}; esperado ${JSON.stringify(expected)}; complete ${JSON.stringify(completes[0]?.payload)}` });
    expect.soft(completes[0]?.payload, "result = { completed: true, total, ...scoreOf(marcadas) }, igual con la respuesta acertada o errada").toEqual(expected);
  });

// ---------- C27 ----------

test("C27 · el payload de onComplete pasa el esquema zod (con score) y 0 ≤ hits ≤ total ≤ máximo de la dificultad", async ({ page, variant }) => {
  const [{ gameResultSchema }, meta] = await Promise.all([loadContract(), loadMeta(variant)]);
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  const log = await finishGame(page, variant);
  const payload = lastComplete(log);
  const parsed = gameResultSchema.safeParse(payload);
  expect.soft(parsed.success, `esquema: ${JSON.stringify(payload)} ${parsed.error ? String(parsed.error) : ""}`).toBe(true);
  const max = maxTotalOf(meta, meta.difficulties ? meta.defaultDifficulty : undefined);
  const ok = !!payload && payload.hits >= 0 && payload.hits <= payload.total && payload.total <= max;
  expect.soft(ok, `0 ≤ hits ≤ total ≤ ${max}: ${JSON.stringify(payload)}`).toBe(true);
});

// ---------- C28 ----------

test("C28 · espacios de DOM accesibles por rol, score en el resultado y foco en el título", async ({ page, variant }) => {
  const meta = await loadMeta(variant);
  // Run games at ×1 with the bot, so that something is collected and the regular result (with meta.learning) shows.
  test.setTimeout(240_000);
  await gotoBench(page, variant.id, variant.run ? botParams(variant) : fastParams(variant));
  await expect.soft(startButton(page), 'botón "Empezar"').toBeVisible();
  await startGame(page);
  expect.soft(await page.locator(LIVE).getAttribute("aria-live"), 'región data-testid="live" con aria-live').toBe("polite");
  const log = await finishGame(page, variant, variant.run ? { steer: "all" } : {});
  await waitForState(page, "result");
  await expect
    .poll(() => page.evaluate((sel) => document.activeElement === document.querySelector(sel), RESULT_TITLE), {
      message: "foco en el título de la pantalla de resultado",
      timeout: 500,
    })
    .toBe(true);
  const result = lastComplete(log);
  expect(result?.total ?? 0, "[control] la partida terminó con algo para clasificar").toBeGreaterThan(0);
  await expect.soft(page.locator(RESULT_SCORE).first(), "result-score con el número de score").toContainText(String(result?.score ?? "?"));
  await expect.soft(page.getByText(meta.learning.replace(/\s+/g, " ").trim(), { exact: false }).first(), "meta.learning en el resultado").toBeVisible();
  await expect.soft(page.getByRole("button", { name: "Reportar", exact: true }), 'botón "Reportar"').toBeVisible();
});

test("C28 · el marcador muestra hits / total después de cada acierto", async ({ page, variant }) => {
  test.skip(variant.run || !!variant.scene, "juego de una fase; los de recorrido y de escena tienen su test de marcadores");
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  await page.locator(STAGE).focus();
  let scored = 0;
  for (let i = 0; i < 40 && (await readLog(page)).every((e) => e.event !== "complete"); i++) {
    const from = await logLength(page);
    await page.keyboard.press("Enter");
    const progressed = await waitForLogEvent(page, "progress", from, INPUT_SETTLE_MS).catch(() => -1);
    if (progressed < 0) {
      await page.keyboard.press("ArrowRight");
      continue;
    }
    const p = progressOf((await readLog(page))[progressed]);
    scored++;
    await expect
      .poll(async () => ((await page.locator(SCORE).first().textContent()) ?? "").replace(/\s+/g, " "), {
        message: `marcador después del acierto ${scored}`,
        timeout: 500,
      })
      .toContain(`${p.hits} / ${p.total}`);
  }
  expect(scored, "[control] no hubo aciertos").toBeGreaterThan(0);
});

test("C28 · selector de dificultad: radios con la etiqueta de cada dificultad y el default marcado", async ({ page, variant }) => {
  test.skip(!variant.run && !variant.scene, "solo juegos que declaran dificultades");
  const meta = await loadMeta(variant);
  expect(meta.difficulties?.length ?? 0, "[control] meta.difficulties").toBeGreaterThan(0);
  await gotoBench(page, variant.id, fastParams(variant));
  await waitForState(page, "intro");
  await expect.soft(page.getByRole("radiogroup", { name: "Dificultad" }), "radiogroup Dificultad").toBeVisible();
  await expect.soft(page.locator(DIFFICULTY), 'data-testid="difficulty"').toBeVisible();
  for (const d of meta.difficulties ?? []) {
    const radio = page.locator(`[data-testid="difficulty-${d.id}"]`);
    expect.soft(await radio.getAttribute("type"), `difficulty-${d.id} es input radio`).toBe("radio");
    await expect.soft(page.getByRole("radio", { name: d.label, exact: true }), `radio "${d.label}"`).toBeVisible();
    if (d.id === meta.defaultDifficulty) await expect.soft(radio, `default ${d.id} marcado`).toBeChecked();
    else await expect.soft(radio, `${d.id} sin marcar`).not.toBeChecked();
  }
});

test("C28 · marcador de recorrido al día después de cada recolección y hits / total después de cada acierto", async ({ page, variant }) => {
  test.skip(!variant.run, "juego con recorrido");
  test.setTimeout(240_000);
  await page.addInitScript(instrumentRun);
  await gotoBench(page, variant.id, botParams(variant));
  await startGame(page);
  const { from } = await playRun(page);
  const log = (await readLog(page)).slice(from);
  const probe = await readRunProbe(page);
  const collects = log.filter((e) => e.event === "collect");
  expect(collects.length, "[control] no hubo recolecciones").toBeGreaterThan(0);
  for (const c of collects) {
    const { collected, inChannel } = c.payload as { collected: number; inChannel: number };
    const shown = probe.collectTexts.find((x) => x.t >= c.t - 1 && x.t <= c.t + 500 && x.text.trim() === `${collected} / ${inChannel}`);
    expect.soft(!!shown, `marcador "collect" = "${collected} / ${inChannel}" dentro de los 500 ms (vistos: ${JSON.stringify(probe.collectTexts.map((x) => x.text))})`).toBe(true);
  }
  for (const p of log.filter((e) => e.event === "progress")) {
    const { hits, total } = progressOf(p);
    const shown = probe.scoreTexts.find((x) => x.t >= p.t - 1 && x.t <= p.t + 500 && x.text.replace(/\s+/g, " ").includes(`${hits} / ${total}`));
    expect.soft(!!shown, `marcador "score" con "${hits} / ${total}" dentro de los 500 ms`).toBe(true);
  }
});

test("C28 · con total 0, el resultado muestra el texto alternativo de meta.emptyResult", async ({ page, variant }) => {
  test.skip(!variant.run, "juego con recorrido (camino de total 0: ArrowLeft sostenida)");
  const meta = await loadMeta(variant);
  expect(meta.emptyResult, "[control] meta.emptyResult").toBeDefined();
  // ArrowLeft pressed right at `ready` (steerRun "left" presses before anything else), held the whole run. Seed: the agreed
  // dummy guarantee, or (games with buildRun) one where no item arrives within pickupHalfWidth of playerMinX.
  test.setTimeout(240_000);
  const seed = emptySeed(variant, meta.defaultDifficulty ?? "calm");
  expect(seed, "[control] ninguna semilla 1–1000 sin residuos al alcance del kayak contra la orilla").not.toBeNull();
  await gotoBench(page, variant.id, botParams(variant, { seed: seed ?? undefined }));
  const from = await logLength(page);
  await startGame(page);
  await steerRun(page, "keyboard", "left");
  await waitForLogEvent(page, "run-end", from, 30_000);
  await waitForState(page, "result", 15_000);
  const log = (await readLog(page)).slice(from);
  const readyT = log.find((e) => e.event === "ready")?.t ?? 0;
  const collects = log.filter((e) => e.event === "collect").map((e) => `${JSON.stringify(e.payload)} a los ${Math.round(e.t - readyT)} ms de ready`);
  test.info().annotations.push({ type: "info", description: `collect: ${collects.join("; ") || "(ninguno)"}` });
  const result = lastComplete(log);
  expect(result?.total, "[control] con ArrowLeft sostenida no se recolecta nada").toBe(0);
  await expect.soft(page.locator(RESULT_TITLE), "result-title").toHaveText(meta.emptyResult?.title ?? "");
  await expect.soft(page.locator(RESULT_EMPTY), "result-empty").toHaveText(meta.emptyResult?.text ?? "");
  // G1 (user decision): with total 0 the emptyResult title replaces the score, in every game.
  await expect.soft(page.locator(RESULT_SCORE), "result-score no se muestra con total 0").toBeHidden();
});

// E2, scene game.

const scoreText = (page: Page) => page.locator(SCORE).first().textContent().then(norm);

test('C28 · hitsFrom "game": el marcador muestra hits / total después de cada acierto del canvas y lo conserva en la revisión', async ({ page, variant }) => {
  test.skip(!variant.scene, "juego de escena (hitsFrom game)");
  test.setTimeout(240_000);
  const meta = await loadMeta(variant);
  const data = loadSceneData(variant);
  const plan = partialSceneMarks(variant, data.MARKS[meta.defaultDifficulty ?? ""]);
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  const seen: { last: Progress | null } = { last: null };
  await playScene(page, variant, plan.ids, "keyboard", {
    afterMark: async (s) => {
      const progress = (await readLog(page)).slice(s.logFrom, s.logTo).filter((e) => e.event === "progress");
      if (!progress.length) return;
      const p = progressOf(progress[progress.length - 1]);
      seen.last = p;
      const want = `${p.hits} / ${p.total}`;
      const shown = await settle(() => scoreText(page), (t) => t.includes(want));
      expect.soft(shown, `marcador después de marcar ${s.id} (debe contener "${want}")`).toContain(want);
    },
  });
  expect(seen.last, "[control] hubo aciertos en el canvas").not.toBeNull();
  const want = `${seen.last?.hits} / ${seen.last?.total}`;
  await waitForState(page, "review", 10_000);
  expect.soft(await settle(() => scoreText(page), (t) => t.includes(want)), `marcador al entrar a la revisión (debe seguir en "${want}")`).toContain(want);
  // Answer right (the case that would add a hit if the review scored), then check again before "Ver resultado".
  const { QUESTION } = data;
  await page.locator(`[data-testid="${REVIEW_OPTION_PREFIX}${QUESTION.answer}"]`).focus();
  await page.keyboard.press("Enter");
  await page.locator(REVIEW_FEEDBACK).first().waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(500);
  expect.soft(await scoreText(page), `marcador después de contestar bien (debe seguir en "${want}")`).toContain(want);
  await page.locator(REVIEW_NEXT).first().click();
  await waitForState(page, "result", 10_000);
});

test("C28 · panel de texto con el último announce (playing y review) y contador con valor / máximo", async ({ page, variant }) => {
  test.skip(!variant.scene, "juego de escena (textPanel y counterLabel)");
  test.setTimeout(240_000);
  const meta = await loadMeta(variant);
  expect(meta.textPanel, "[control] meta.textPanel").toBe(true);
  expect(typeof meta.counterLabel, "[control] meta.counterLabel").toBe("string");
  const data = loadSceneData(variant);
  const plan = partialSceneMarks(variant, data.MARKS[meta.defaultDifficulty ?? ""]);
  await gotoBench(page, variant.id, fastParams(variant));
  const from = await logLength(page);
  await startGame(page);

  const panelText = () => page.locator(TEXT_PANEL).first().textContent().then((t) => (t ?? "").trim());
  const checkPanel = async (where: string, since: number) => {
    const announce = [...(await readLog(page)).slice(since)].reverse().find((e) => e.event === "announce");
    expect(announce, `[control] hubo announce (${where})`).toBeDefined();
    const want = String(announce?.payload ?? "").trim();
    const shown = await settle(panelText, (t) => t === want);
    expect.soft(shown, `text-panel = último announce (${where})`).toBe(want);
    await expect.soft(page.locator(TEXT_PANEL).first(), `text-panel visible (${where})`).toBeVisible({ timeout: 500 });
  };
  const checkCounter = async (where: string) => {
    const counter = [...(await readLog(page)).slice(from)].reverse().find((e) => e.event === "counter");
    expect(counter, `[control] hubo un evento counter (${where})`).toBeDefined();
    const { value, max } = counter?.payload as { value: number; max: number };
    const want = `${value} / ${max}`;
    const shown = await settle(() => page.locator(COUNTER).first().textContent().then(norm), (t) => t.includes(want));
    expect.soft(shown, `contador con "${want}" (${where})`).toContain(want);
    // Agreed interface: the counter element holds "<value> / <max>" and the label goes next to it, on its line (as
    // with the score marker).
    const line = await page
      .locator(COUNTER)
      .first()
      .evaluate((el) => (el.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim())
      .catch(() => "");
    expect.soft(line, `línea del contador con la etiqueta "${meta.counterLabel}" (${where})`).toContain(meta.counterLabel ?? "");
    await expect.soft(page.locator(COUNTER).first(), `contador visible (${where})`).toBeVisible({ timeout: 500 });
  };

  await checkCounter("al empezar");
  await playScene(page, variant, plan.ids, "keyboard", {
    afterMark: async (s) => {
      await checkPanel(`después de marcar ${s.id}`, s.logFrom);
      // The counter lives in loading/playing (the last mark moves the wrapper to review).
      if ((await wrapperState(page)) === "playing") await checkCounter(`después de marcar ${s.id}`);
    },
  });
  await waitForState(page, "review", 10_000);
  const before = await logLength(page);
  await page.locator(`[data-testid="${REVIEW_OPTION_PREFIX}${data.QUESTION.answer}"]`).click();
  await page.locator(REVIEW_FEEDBACK).first().waitFor({ state: "visible", timeout: 5_000 });
  await checkPanel("después de contestar la revisión", before);
  await page.locator(REVIEW_NEXT).first().click();
  await waitForState(page, "result", 10_000);
});

test("C28 · resultado vacío según meta.emptyResult.when: con la condición, título y texto de meta sin result-score; sin ella, result-score", async ({ page, variant }) => {
  test.skip(!variant.scene, "juego de escena (emptyResult.when hits)");
  test.skip(variant.sceneEmptyInBrowser === false, "hits 0 no se puede producir como partida en este juego: se verifica en Node (acordado en G2)");
  test.setTimeout(240_000);
  const meta = await loadMeta(variant);
  const data = loadSceneData(variant);
  expect(meta.emptyResult?.when, "[control] meta.emptyResult.when").toBe("hits");
  const decoys = sceneZoneIds(variant, "decoy");
  const tight = meta.difficulties?.find((d) => data.MARKS[d.id] <= decoys.length);
  expect(tight, "[control] una dificultad con tantas marcas como señuelos o menos (hits 0 alcanzable)").toBeDefined();

  // Condition met: only decoys → hits 0 with total > 0.
  await gotoBench(page, variant.id, fastParams(variant, { difficulty: tight?.id }));
  await startGame(page);
  let from = await logLength(page);
  await playScene(page, variant, decoys.slice(0, data.MARKS[tight?.id ?? ""]), "keyboard");
  await waitForLogEvent(page, "run-end", from, 10_000);
  await answerReview(page, sceneAnswers(variant));
  await waitForState(page, "result", 10_000);
  const empty = lastComplete((await readLog(page)).slice(from));
  test.info().annotations.push({ type: "info", description: `${tight?.id}, solo señuelos: ${JSON.stringify(empty)}` });
  expect(empty?.hits, "[control] solo señuelos: hits 0").toBe(0);
  expect(empty?.total ?? 0, "[control] total > 0: la condición que decide es hits, no total").toBeGreaterThan(0);
  await expect.soft(page.locator(RESULT_TITLE), "result-title = meta.emptyResult.title").toHaveText(meta.emptyResult?.title ?? "");
  await expect.soft(page.locator(RESULT_EMPTY), "result-empty = meta.emptyResult.text").toHaveText(meta.emptyResult?.text ?? "");
  await expect.soft(page.locator(RESULT_SCORE), "result-score no se muestra con la condición cumplida").toBeHidden();

  // Condition not met: every signal → regular result.
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  from = await logLength(page);
  await finishGame(page, variant);
  const full = lastComplete((await readLog(page)).slice(from));
  expect(full?.hits ?? 0, "[control] todas las señales: hits > 0").toBeGreaterThan(0);
  await expect.soft(page.locator(RESULT_SCORE).first(), "result-score con el score sin la condición").toContainText(String(full?.score ?? "?"));
  await expect.soft(page.locator(RESULT_EMPTY), "result-empty no se muestra sin la condición").toBeHidden();
});

test('C28 · resultado vacío por hits, en Node: meta.emptyResult.when === "hits"', async ({ variant }) => {
  test.skip(!variant.scene || variant.sceneEmptyInBrowser !== false, "solo juegos de escena donde hits 0 no se puede producir como partida (water-signs, acordado en G2)");
  const meta = await loadMeta(variant);
  expect(meta.emptyResult?.when, "meta.emptyResult.when").toBe("hits");
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
])
  test(`C28 · el panel de texto no tapa el escenario a ${viewport.width} px (rectángulos de text-panel y stage sin intersección)`, async ({ page, variant }) => {
    test.skip(!variant.scene, "juego de escena (textPanel)");
    await page.setViewportSize(viewport);
    await gotoBench(page, variant.id, fastParams(variant));
    await startGame(page);
    await playScene(page, variant, sceneZoneIds(variant, "decoy").slice(0, 1), "keyboard");
    await expect(page.locator(TEXT_PANEL).first(), "[control] text-panel visible después de una marca").toBeVisible({ timeout: 500 });
    const rects = await page.evaluate(
      ([panelSel, stageSel]) => {
        const box = (sel: string) => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
        };
        return { panel: box(panelSel), stage: box(stageSel) };
      },
      [TEXT_PANEL, STAGE] as const,
    );
    const { panel, stage } = rects;
    expect(panel && stage, `[control] rectángulos ${JSON.stringify(rects)}`).toBeTruthy();
    expect(panel!.bottom - panel!.top, "[control] text-panel con alto > 0").toBeGreaterThan(0);
    const overlapW = Math.max(0, Math.min(panel!.right, stage!.right) - Math.max(panel!.left, stage!.left));
    const overlapH = Math.max(0, Math.min(panel!.bottom, stage!.bottom) - Math.max(panel!.top, stage!.top));
    expect.soft(overlapW * overlapH, `intersección de text-panel ${JSON.stringify(panel)} con stage ${JSON.stringify(stage)} (px²)`).toBe(0);
  });

// ---------- C29 ----------

test('C29 · "Reportar" llama a onReport una vez y la URL no cambia', async ({ page, variant }) => {
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  await finishGame(page, variant);
  await waitForState(page, "result");
  const url = page.url();
  const from = await logLength(page);
  await page.getByRole("button", { name: "Reportar", exact: true }).click();
  await page.waitForTimeout(500);
  const reports = (await readLog(page)).slice(from).filter((e) => e.event === "report");
  expect.soft(reports.length, "onReport").toBe(1);
  expect.soft(page.url(), "URL").toBe(url);
});

// ---------- C30 ----------

async function playToResult(page: Page, variant: Variant) {
  if (variant.scene) await finishGame(page, variant);
  else if (variant.run) await playRun(page);
  else {
    await completeWithKeyboard(page);
    await waitForState(page, "result");
  }
}

test("C30 · persistencia: pasa el esquema, guarda el de más score (empate: el último) y el índice lo muestra al recargar", async ({ page, variant }) => {
  const { progressEntrySchema } = await loadContract();
  const seeded = variant.run || variant.scene
    ? { completed: true, hits: 0, total: 0, score: 0, savedAt: "2020-01-01T00:00:00.000Z" }
    : { completed: false, hits: 1, total: 3, score: 1, savedAt: "2020-01-01T00:00:00.000Z" };
  // Seed a worse result once (sessionStorage guard: the init script also runs on reload).
  await page.addInitScript(
    ([key, id, entry]) => {
      if (sessionStorage.getItem("__judgeSeeded")) return;
      sessionStorage.setItem("__judgeSeeded", "1");
      localStorage.setItem(key, JSON.stringify({ [id]: entry }));
    },
    [PROGRESS_KEY, variant.id, seeded] as const,
  );
  type Stored = { hits: number; total: number; score: number; completed: boolean; savedAt: string } | null;
  const stored = () =>
    page.evaluate(([key, id]) => (JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>)[id] ?? null, [PROGRESS_KEY, variant.id] as const) as Promise<Stored>;

  // Run games: the bot at the agreed scale; collecting and answering right gives a score above the seeded 0.
  test.setTimeout(300_000);
  await gotoBench(page, variant.id, variant.run ? botParams(variant) : fastParams(variant));
  await startGame(page);
  let from = await logLength(page);
  await playToResult(page, variant);
  await page.waitForTimeout(500);
  const r1 = lastComplete((await readLog(page)).slice(from));
  const first = await stored();
  expect(r1, "[control] la primera partida terminó con complete").toBeDefined();
  expect(r1!.score, `[control] la primera partida supera al resultado sembrado (score ${seeded.score}): ${JSON.stringify(r1)}`).toBeGreaterThan(seeded.score);
  expect.soft(progressEntrySchema.safeParse(first).success, `entrada guardada ${JSON.stringify(first)} pasa el esquema`).toBe(true);
  expect.soft(first && { completed: first.completed, hits: first.hits, total: first.total, score: first.score }, "reemplaza al sembrado con menos score: guarda la partida 1").toEqual(r1);

  // Second play: the stored entry must be the best so far, the latest on a tie (pickBest semantics, observed results).
  await page.getByRole("button", { name: "Jugar de nuevo", exact: true }).click();
  await waitForState(page, "playing");
  from = await logLength(page);
  await playToResult(page, variant);
  await page.waitForTimeout(500);
  const r2 = lastComplete((await readLog(page)).slice(from));
  const second = await stored();
  test.info().annotations.push({ type: "info", description: `partida 1 ${JSON.stringify(r1)}; partida 2 ${JSON.stringify(r2)}; guardado ${JSON.stringify(second)}` });
  expect(r2, "[control] la segunda partida terminó con complete").toBeDefined();
  expect.soft(progressEntrySchema.safeParse(second).success, `entrada guardada ${JSON.stringify(second)} pasa el esquema`).toBe(true);
  const secondWins = r2!.score >= r1!.score;
  expect.soft(second && { completed: second.completed, hits: second.hits, total: second.total, score: second.score }, `guarda el mejor (${secondWins ? "partida 2: mayor o igual score, empate → la última" : "partida 1: la 2 tuvo menos score"})`).toEqual(secondWins ? r2 : r1);
  if (secondWins)
    expect.soft(!!second && !!first && Date.parse(second.savedAt) > Date.parse(first.savedAt), `savedAt ${second?.savedAt} posterior a ${first?.savedAt}`).toBe(true);
  else expect.soft(second?.savedAt, "un resultado peor no pisa al guardado: mismo savedAt").toBe(first?.savedAt);

  await page.reload();
  const index = page.locator(`[data-testid="progress-${variant.id}"]`);
  await expect.soft(index, `índice del banco data-testid="progress-${variant.id}"`).toContainText(`${second?.hits ?? "?"} / ${second?.total ?? "?"}`);
});

test("C30(c) · pickBest (Node): gana el de más score; un peor no pisa al guardado; en un empate, el último", async ({ variant }) => {
  test.skip(variant.id !== ONCE_VARIANT.id, `prueba de Node: corre una vez, en el proyecto de ${ONCE_VARIANT.id}`);
  const { pickBest } = await loadGameProgress();
  const stored = { completed: true, hits: 3, total: 3, score: 30, savedAt: "2026-01-01T00:00:00.000Z" };
  const worse = { completed: true, hits: 3, total: 3, score: 10, savedAt: "2026-02-01T00:00:00.000Z" };
  const better = { completed: true, hits: 1, total: 3, score: 40, savedAt: "2026-03-01T00:00:00.000Z" };
  const tie = { completed: true, hits: 2, total: 2, score: 30, savedAt: "2026-04-01T00:00:00.000Z" };
  expect.soft(pickBest(stored, worse), "un resultado con menos score no pisa al guardado").toEqual(stored);
  expect.soft(pickBest(stored, better), "uno con más score reemplaza al guardado").toEqual(better);
  expect.soft(pickBest(stored, tie), "en un empate de score gana el último").toEqual(tie);
});

// ---------- C32 ----------

test("C32 · partida completa sin pageerror ni console.error (salvo los 404 de assetBase)", async ({ page, variant }) => {
  const c = watchConsole(page, variant.assetBase);
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  await finishGame(page, variant);
  await waitForState(page, "result");
  await page.waitForTimeout(500);
  expect.soft(c.pageErrors, "pageerror").toEqual([]);
  expect.soft(c.errors(), "console.error (sin los 404 de assetBase)").toEqual([]);
});
