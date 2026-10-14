// JUDGE · G1, games with buildRun (clean-channels): C37 (composition and separation, Node), C38 (parity debugRun() =
// buildRun()) and C39 (result according to the specification). Composition, points and maxima come from the
// specification (tables "Distribución por dificultad" and "Residuos y contenedores", maxima corrected by the user to
// 165 / 195 / 250); the N2 factors 0.7 and 0.6 s are the ones the user approved. v_k and R come from buildRun().kinematics.
// G1b adds, in Node, the rename of `batteries` to "Pilas" (WASTE in meta.ts).
import {
  answerReview,
  botParams,
  captureAnswers,
  emptySeed,
  expect,
  fastParams,
  gotoBench,
  importModule,
  loadBuildRun,
  loadMeta,
  logLength,
  readLog,
  RESULT_EMPTY,
  RESULT_SCORE,
  RESULT_TITLE,
  SEED,
  startGame,
  steerRun,
  test,
  waitForLogEvent,
  waitForState,
  debugRun,
  type BuiltRun,
  type LogEntry,
} from "./support";

test.skip(({ variant }) => !variant.hasBuildRun, "criterios de juegos con buildRun (clean-channels)");

const DIFFICULTIES = ["calm", "normal", "fast"] as const;
const LAYOUTS = ["landscape", "portrait"] as const;
const COMPOSITION: Record<string, Record<string, number>> = {
  calm: { batteries: 1, "oily-container": 2, styrofoam: 1, "glass-bottle": 2, "pet-bottle": 1, can: 2, "fruit-peel": 1 },
  normal: { batteries: 1, "oily-container": 2, styrofoam: 2, "glass-bottle": 2, "pet-bottle": 2, can: 2, "fruit-peel": 1 },
  fast: { batteries: 2, "oily-container": 2, styrofoam: 2, "glass-bottle": 2, "pet-bottle": 3, can: 2, "fruit-peel": 2 },
};
const POINTS: Record<string, number> = { batteries: 40, "oily-container": 25, styrofoam: 20, "glass-bottle": 10, "pet-bottle": 10, can: 10, "fruit-peel": 5 };
const EXPECTED_MAX: Record<string, number> = { calm: 165, normal: 195, fast: 250 };
const N2_MARGIN = 0.7;
const N2_MIN_GAP_MS = 600;
const SEEDS = 200;

type Result = { completed: boolean; hits: number; total: number; score: number };
const lastPayload = (log: LogEntry[], event: string) => [...log].reverse().find((e) => e.event === event)?.payload;
const itemsOf = (run: BuiltRun) => run.items.filter((i) => i.kind === "item");
const maxScore = (run: BuiltRun) => itemsOf(run).reduce((sum, i) => sum + (POINTS[i.type] ?? 0), 0);

// ---------- G1b ----------

// User's request (G1b, 13/10/2026; check agreed with the coordinator): the waste `batteries` is renamed "Pilas".
test('G1b · renombre (Node): WASTE.batteries.name de clean-channels es "Pilas"', ({ variant }) => {
  const { WASTE } = importModule<{ WASTE?: Record<string, { name: string }> }>(`${variant.dir}/meta.ts`);
  expect(WASTE, `[control] ${variant.dir}/meta.ts exporta WASTE`).toBeDefined();
  expect(WASTE?.batteries?.name, "WASTE.batteries.name").toBe("Pilas");
});

// ---------- C37 ----------

test(`C37 · composición y separación de buildRun: ${SEEDS} semillas × 3 dificultades × 2 diseños`, ({ variant }) => {
  const buildRun = loadBuildRun(variant);
  const failures: string[] = [];
  for (const d of DIFFICULTIES) {
    const tableMax = Object.entries(COMPOSITION[d]).reduce((sum, [type, n]) => sum + POINTS[type] * n, 0);
    expect(tableMax, `[control] la tabla de la especificación da el máximo corregido de ${d}`).toBe(EXPECTED_MAX[d]);
  }
  let checked = 0;
  for (const d of DIFFICULTIES)
    for (const layout of LAYOUTS)
      for (let seed = 1; seed <= SEEDS; seed++) {
        const where = `${d}/${layout}/semilla ${seed}`;
        const run = buildRun({ difficulty: d, seed, layout });
        checked++;
        if (run.difficulty !== d || run.layout !== layout) failures.push(`${where}: buildRun devolvió ${run.difficulty}/${run.layout}`);
        const items = itemsOf(run);
        const counts: Record<string, number> = {};
        for (const i of items) counts[i.type] = (counts[i.type] ?? 0) + 1;
        const expected = COMPOSITION[d];
        const types = new Set([...Object.keys(counts), ...Object.keys(expected)]);
        for (const t of types) if ((counts[t] ?? 0) !== (expected[t] ?? 0)) failures.push(`${where}: ${t} ${counts[t] ?? 0} ≠ ${expected[t] ?? 0}`);
        if ((counts.batteries ?? 0) < 1) failures.push(`${where}: sin batteries`);
        if (!counts["oily-container"] || !counts.styrofoam) failures.push(`${where}: falta un engañoso`);
        const { playerSpeed, pickupHalfWidth, visibleMs } = run.kinematics;
        const sorted = [...items].sort((a, b) => a.arriveAt - b.arriveAt);
        for (let k = 1; k < sorted.length; k++) {
          const [a, b] = [sorted[k - 1], sorted[k]];
          const dtMs = b.arriveAt - a.arriveAt;
          const need = Math.max(0, Math.abs(b.x - a.x) - 2 * pickupHalfWidth);
          const can = (N2_MARGIN * playerSpeed * dtMs) / 1000;
          if (dtMs < N2_MIN_GAP_MS) failures.push(`${where}: ${a.id}→${b.id} Δt ${dtMs} ms < ${N2_MIN_GAP_MS}`);
          if (need > can) failures.push(`${where}: ${a.id}→${b.id} necesita ${need.toFixed(1)} px y alcanza ${can.toFixed(1)} px`);
        }
        for (const o of run.items)
          if (o.arriveAt - visibleMs < 0 || o.arriveAt > run.durationMs)
            failures.push(`${where}: ${o.id} (${o.kind}) llega a los ${o.arriveAt} ms, fuera de [${visibleMs}, ${run.durationMs}]`);
      }
  test.info().annotations.push({ type: "info", description: `${checked} recorridos revisados; ${failures.length} incumplimientos` });
  expect(failures.slice(0, 40), `${failures.length} incumplimientos (primeros 40)`).toEqual([]);
});

// ---------- C38 ----------

const PARITY_FIELDS = ["id", "kind", "type", "x", "arriveAt", "answer"] as const;
const pick = (items: { [k: string]: unknown }[]) => items.map((it) => Object.fromEntries(PARITY_FIELDS.map((k) => [k, it[k]])));

for (const layout of LAYOUTS)
  for (const d of DIFFICULTIES)
    test(`C38 · paridad debugRun().items = buildRun() · ${d} · ${layout}`, async ({ page, variant }) => {
      test.setTimeout(240_000);
      const buildRun = loadBuildRun(variant);
      await page.setViewportSize(layout === "landscape" ? { width: 1280, height: 720 } : { width: 390, height: 844 });
      for (const seed of [1, 7, 42]) {
        await gotoBench(page, variant.id, fastParams(variant, { seed, difficulty: d }));
        await startGame(page);
        const run = await debugRun(page);
        expect(run, `debugRun() semilla ${seed}`).not.toBeNull();
        expect(run?.layout, `[control] diseño del navegador (semilla ${seed})`).toBe(layout);
        expect.soft(pick(run?.items ?? []), `semilla ${seed}: items del navegador = buildRun en Node`).toEqual(pick(buildRun({ difficulty: d, seed, layout }).items));
      }
    });

// ---------- C39 ----------

for (const d of DIFFICULTIES)
  test(`C39(a) · ${d}: recolectando todo y clasificando todo bien, result = { completed, hits: N, total: N, score: máximo }`, async ({ page, variant }) => {
    test.setTimeout(240_000);
    const plan = loadBuildRun(variant)({ difficulty: d, seed: SEED, layout: "landscape" });
    const n = itemsOf(plan).length;
    expect.soft(maxScore(plan), `máximo de ${d} calculado de buildRun con los puntos de la especificación`).toBe(EXPECTED_MAX[d]);
    await gotoBench(page, variant.id, botParams(variant, { difficulty: d }));
    await startGame(page);
    const answers = await captureAnswers(page);
    const from = await logLength(page);
    await steerRun(page, "keyboard", "all");
    await waitForLogEvent(page, "run-end", from, 60_000);
    await answerReview(page, answers, "keyboard", () => true);
    await waitForState(page, "result", 10_000);
    const log = (await readLog(page)).slice(from);
    test.info().annotations.push({ type: "info", description: `recolectados ${JSON.stringify(lastPayload(log, "collect"))}; result ${JSON.stringify(lastPayload(log, "complete"))}` });
    expect.soft(lastPayload(log, "complete") as Result, `result de ${d}`).toEqual({ completed: true, hits: n, total: n, score: EXPECTED_MAX[d] });
  });

test("C39(b) · clasificando todo mal: hits 0, score 0 y total = recolectados", async ({ page, variant }) => {
  test.setTimeout(240_000);
  await gotoBench(page, variant.id, botParams(variant, { difficulty: "calm" }));
  await startGame(page);
  const answers = await captureAnswers(page);
  const from = await logLength(page);
  await steerRun(page, "keyboard", "all");
  await waitForLogEvent(page, "run-end", from, 60_000);
  await answerReview(page, answers, "keyboard", () => false);
  await waitForState(page, "result", 10_000);
  const log = (await readLog(page)).slice(from);
  const collected = (lastPayload(log, "collect") as { collected: number } | undefined)?.collected;
  const result = lastPayload(log, "complete") as Result | undefined;
  expect(collected ?? 0, "[control] se recolectó al menos un residuo").toBeGreaterThan(0);
  expect.soft({ hits: result?.hits, score: result?.score, total: result?.total }, `result ${JSON.stringify(result)}`).toEqual({ hits: 0, score: 0, total: collected });
});

test("C39(c) · sin recolectar nada: result = { completed: true, hits: 0, total: 0, score: 0 } con emptyResult", async ({ page, variant }) => {
  test.setTimeout(240_000);
  const meta = await loadMeta(variant);
  const seed = emptySeed(variant, "calm", "landscape");
  expect(seed, "[control] ninguna semilla 1–1000 sin residuos al alcance del kayak contra la orilla").not.toBeNull();
  await gotoBench(page, variant.id, botParams(variant, { seed: seed ?? undefined, difficulty: "calm" }));
  const from = await logLength(page);
  await startGame(page);
  await steerRun(page, "keyboard", "left");
  await waitForLogEvent(page, "run-end", from, 60_000);
  await waitForState(page, "result", 15_000);
  const result = lastPayload((await readLog(page)).slice(from), "complete") as Result | undefined;
  test.info().annotations.push({ type: "info", description: `semilla ${seed}; result ${JSON.stringify(result)}` });
  expect.soft(result, "result sin recolectar nada").toEqual({ completed: true, hits: 0, total: 0, score: 0 });
  await expect.soft(page.locator(RESULT_TITLE), "result-title = meta.emptyResult.title").toHaveText(meta.emptyResult?.title ?? "");
  await expect.soft(page.locator(RESULT_EMPTY), "result-empty = meta.emptyResult.text").toHaveText(meta.emptyResult?.text ?? "");
  // G1 (user decision): with total 0 the emptyResult title replaces the score, in every game.
  await expect.soft(page.locator(RESULT_SCORE), "result-score no se muestra con total 0").toBeHidden();
});
