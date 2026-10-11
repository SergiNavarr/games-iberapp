// JUDGE · C26 (coherent callbacks), C27 (valid result), C28 (DOM slots), C29 ("Reportar" goes through the landing),
// C30 (persistence) and C32 (clean console), against `_dummy` with a fixed seed and testHooks. C30: (a) a seeded worse
// entry is replaced, (b) a tie keeps the latest, (c) pickBest in Node keeps a better stored entry (the dummy can never
// finish with fewer hits).
import { expect, test, type Page } from "@playwright/test";
import {
  completeWithKeyboard,
  DUMMY,
  gotoBench,
  LIVE,
  loadContract,
  loadDummyMeta,
  loadGameProgress,
  logLength,
  RAW_STAGE,
  readLog,
  RESULT_TITLE,
  SCORE,
  SEED,
  STAGE,
  startButton,
  startGame,
  waitForLogEvent,
  waitForState,
  watchConsole,
  type ConformanceWindow,
  type LogEntry,
} from "./support";

const PROGRESS_KEY = "ibera-games-progress";
const INPUT_SETTLE_MS = 300;

type Progress = { hits: number; total: number };
const progressOf = (e: LogEntry) => e.payload as Progress;

/** Plays one input at a time (Enter; ArrowRight when Enter did not score) and returns the log segment of each input. */
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

test("C26 · cada acierto da 1 onProgress (hits + 1) y ≥ 1 announce; onComplete exactamente 1 vez", async ({ page }) => {
  await gotoBench(page);
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
  const log = await readLog(page);
  expect.soft(log.filter((e) => e.event === "complete").length, "onComplete").toBe(1);
});

test("C26 · después de onComplete ningún input cambia hits (camino raw, teclado y clics en debugTargets)", async ({ page }) => {
  await gotoBench(page);
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

test("C27 · el payload de onComplete pasa el esquema zod de contract.ts y total === meta.total", async ({ page }) => {
  const [{ gameResultSchema }, meta] = await Promise.all([loadContract(), loadDummyMeta()]);
  await gotoBench(page);
  await startGame(page);
  const log = await completeWithKeyboard(page);
  const payload = log.find((e) => e.event === "complete")?.payload;
  const parsed = gameResultSchema.safeParse(payload);
  expect.soft(parsed.success, `esquema: ${JSON.stringify(payload)} ${parsed.error ? String(parsed.error) : ""}`).toBe(true);
  expect.soft((payload as Progress | undefined)?.total, "total === meta.total").toBe(meta.total);
});

test("C28 · espacios de DOM accesibles por rol y foco en el título del resultado", async ({ page }) => {
  const meta = await loadDummyMeta();
  await gotoBench(page);
  await expect.soft(startButton(page), 'botón "Empezar"').toBeVisible();
  await startGame(page);
  expect.soft(await page.locator(LIVE).getAttribute("aria-live"), 'región data-testid="live" con aria-live').toBe("polite");

  await completeWithKeyboard(page);
  await waitForState(page, "result");
  await expect.soft(page.getByText(meta.learning.replace(/\s+/g, " ").trim(), { exact: false }).first(), "meta.learning en el resultado").toBeVisible();
  await expect.soft(page.getByRole("button", { name: "Reportar", exact: true }), 'botón "Reportar"').toBeVisible();
  await expect
    .poll(() => page.evaluate((sel) => document.activeElement === document.querySelector(sel), RESULT_TITLE), {
      message: "foco en el título de la pantalla de resultado",
      timeout: 500,
    })
    .toBe(true);
});

test("C28 · el marcador muestra hits / total después de cada acierto", async ({ page }) => {
  await gotoBench(page);
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

test('C29 · "Reportar" llama a onReport una vez y la URL no cambia', async ({ page }) => {
  await gotoBench(page);
  await startGame(page);
  await completeWithKeyboard(page);
  await waitForState(page, "result");
  const url = page.url();
  const from = await logLength(page);
  await page.getByRole("button", { name: "Reportar", exact: true }).click();
  await page.waitForTimeout(500);
  const reports = (await readLog(page)).slice(from).filter((e) => e.event === "report");
  expect.soft(reports.length, "onReport").toBe(1);
  expect.soft(page.url(), "URL").toBe(url);
});

test("C30 · persistencia: pasa el esquema, guarda el mejor (empate: el último) y el índice lo muestra al recargar", async ({ page }) => {
  const { progressEntrySchema } = await loadContract();
  const seeded = { completed: false, hits: 1, total: 3, savedAt: "2020-01-01T00:00:00.000Z" };
  // Seed a worse result once (sessionStorage guard: the init script also runs on reload).
  await page.addInitScript(
    ([key, id, entry]) => {
      if (sessionStorage.getItem("__judgeSeeded")) return;
      sessionStorage.setItem("__judgeSeeded", "1");
      localStorage.setItem(key, JSON.stringify({ [id]: entry }));
    },
    [PROGRESS_KEY, DUMMY, seeded] as const,
  );
  const stored = () => page.evaluate(([key, id]) => (JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>)[id] ?? null, [PROGRESS_KEY, DUMMY] as const);

  await gotoBench(page);
  await startGame(page);
  await completeWithKeyboard(page);
  await waitForState(page, "result");
  await page.waitForTimeout(500);
  const first = (await stored()) as { hits: number; total: number; completed: boolean; savedAt: string } | null;
  expect.soft(progressEntrySchema.safeParse(first).success, `entrada guardada ${JSON.stringify(first)} pasa el esquema`).toBe(true);
  expect.soft(first?.hits, "reemplaza al resultado sembrado con menos hits").toBe(3);

  // Tie: playing again with the same result keeps the latest.
  await page.getByRole("button", { name: "Jugar de nuevo", exact: true }).click();
  await waitForState(page, "playing");
  await completeWithKeyboard(page);
  await waitForState(page, "result");
  await page.waitForTimeout(500);
  const second = (await stored()) as { savedAt: string; hits: number; total: number } | null;
  expect.soft(progressEntrySchema.safeParse(second).success, `entrada guardada ${JSON.stringify(second)} pasa el esquema`).toBe(true);
  expect.soft(second && first && Date.parse(second.savedAt) > Date.parse(first.savedAt), `empate: savedAt ${second?.savedAt} posterior a ${first?.savedAt}`).toBe(true);

  await page.reload();
  const index = page.locator(`[data-testid="progress-${DUMMY}"]`);
  await expect.soft(index, `índice del banco data-testid="progress-${DUMMY}"`).toContainText(`${second?.hits ?? 3} / ${second?.total ?? 3}`);
});

test("C30(c) · pickBest (Node): un resultado peor no pisa al guardado", async () => {
  const { pickBest } = await loadGameProgress();
  const stored = { completed: true, hits: 3, total: 3, savedAt: "2026-01-01T00:00:00.000Z" };
  const worse = { completed: false, hits: 1, total: 3, savedAt: "2026-02-01T00:00:00.000Z" };
  expect(pickBest(stored, worse)).toEqual(stored);
});

test("C32 · partida completa sin pageerror ni console.error (salvo los 404 de assetBase)", async ({ page }) => {
  const c = watchConsole(page);
  await gotoBench(page);
  await startGame(page);
  await completeWithKeyboard(page);
  await waitForState(page, "result");
  await page.waitForTimeout(500);
  expect.soft(c.pageErrors, "pageerror").toEqual([]);
  expect.soft(c.errors(), "console.error (sin los 404 de assetBase)").toEqual([]);
});
