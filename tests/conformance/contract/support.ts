// JUDGE (tests/conformance): shared helpers for the W suite (checklist §2.6 + E1 + E2) against the `_dummy` variants.
// Talks to the page only through the fixed interface of the tickets T3+T4, E1 and E2: /conformance/[gameId],
// window.__conformance and the agreed data-testid list. Coder modules (contract.ts, meta.ts, game-progress.ts) are
// loaded by file path at run time, never imported statically, so a renamed export can never break the coder's `tsc`
// or `next build` (C01). JUDGE_MODULES_ROOT overrides where they are read from (only to validate the suite against a
// test double; the verdict always uses the repo).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test as base, type Page } from "@playwright/test";
import { ALL_VARIANTS, CLEAN_VARIANT, DUMMY_VARIANT, ONCE_VARIANT, RUN_VARIANT, SCENE_VARIANT, type Variant } from "./variants";

export { expect } from "@playwright/test";
export { ALL_VARIANTS, CLEAN_VARIANT, DUMMY_VARIANT, ONCE_VARIANT, RUN_VARIANT, SCENE_VARIANT, type Variant };

/** `variant` is a project option (playwright.conformance.config.ts): each W spec runs once per `_dummy` variant. */
// Worker-scoped so beforeAll hooks can read it too. `{}`: no test-scoped fixtures (Playwright's own idiom).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const test = base.extend<{}, { variant: Variant }>({ variant: [DUMMY_VARIANT, { option: true, scope: "worker" }] });

export const DUMMY = DUMMY_VARIANT.id;
export const ASSET_BASE = DUMMY_VARIANT.assetBase;
export const DUMMY_DIR = DUMMY_VARIANT.dir;
export const SHARED_DIR = "lib/games/shared";
export const SEED = 7;
const MODULES_ROOT = process.env.JUDGE_MODULES_ROOT ?? process.cwd();

export const GAME_ROOT = '[data-testid="game-stage"]';
export const STAGE = '[data-testid="stage"]';
export const RAW_STAGE = '[data-testid="raw-stage"]';
export const BOX = '[data-testid="box"]';
export const SCORE = '[data-testid="score"]';
export const LIVE = '[data-testid="live"]';
export const RESULT_TITLE = '[data-testid="result-title"]';
export const RESULT_SCORE = '[data-testid="result-score"]';
export const RESULT_EMPTY = '[data-testid="result-empty"]';
export const COLLECT = '[data-testid="collect"]';
export const DIFFICULTY = '[data-testid="difficulty"]';
export const REVIEW = '[data-testid="review"]';
export const REVIEW_ITEM = '[data-testid="review-item"]';
export const REVIEW_FEEDBACK = '[data-testid="review-feedback"]';
export const REVIEW_NEXT = '[data-testid="review-next"]';
export const REVIEW_OPTION_PREFIX = "review-option-";
export const TEXT_PANEL = '[data-testid="text-panel"]';
export const COUNTER = '[data-testid="counter"]';

export type WrapperState = "coming-soon" | "intro" | "loading" | "playing" | "review" | "result" | "error";
export type LogEntry = { t: number; event: string; payload?: unknown; source?: string };
export type DebugTexture = { key: string; width: number; height: number; frames: number; source: string };
export type DebugRunItem = {
  id: string;
  kind: "item" | "obstacle";
  type: string;
  x: number;
  arriveAt: number;
  answer: string | null;
  collected: boolean;
  resolvedAt: number | null;
};
export type DebugRun = {
  difficulty: string | null;
  layout: "landscape" | "portrait";
  timeScale: number;
  durationMs: number;
  elapsedMs: number;
  ended: boolean;
  player: { x: number; y: number };
  kinematics: { playerSpeed: number; pickupHalfWidth: number; visibleMs: number };
  items: DebugRunItem[];
  spawns: { id: string; kind: string; x: number; t: number }[];
};
export type DebugMotion = { active: number; created: number; flashes: number[]; shakes: number[]; staticFeedback: number[]; collisions: number[] };
/** E2 scene hook: scene px; cssX = view.left + x * view.scale (relative to the mount container, like debugTargets()). */
export type SceneZone = { id: string; kind: "signal" | "decoy"; x: number; y: number; r: number; marked: boolean };
export type DebugScene = {
  difficulty: string | null;
  layout: "landscape" | "portrait";
  view: { left: number; top: number; scale: number; width: number; height: number };
  marks: number;
  marksLeft: number;
  hits: number;
  score: number;
  crosshair: { x: number; y: number; step: number };
  zones: SceneZone[];
  ended: boolean;
};
export type Handle = {
  destroy(): void;
  pause(): void;
  resume(): void;
  setTheme(theme: "dark" | "light", tokens: Record<string, string>): void;
  debugTargets?(): { id: string; x: number; y: number; kind?: string }[];
  debugTextures?(): DebugTexture[];
  debugRun?(): DebugRun | null;
  debugMotion?(): DebugMotion;
  debugScene?(): DebugScene | null;
};
export type RawMountOpts = { seed?: number; reducedMotion?: boolean; theme?: "dark" | "light"; testHooks?: boolean; difficulty?: string; timeScale?: number };
export type ConformanceApi = {
  gameId: string;
  log: LogEntry[];
  handle(): Handle | null;
  setMounted(mounted: boolean): void;
  setGameId(id: string): void;
  setBoxWidth(px: number | null): void;
  setTheme(theme: "dark" | "light"): void;
  raw: {
    importOnly(): Promise<unknown>;
    /** Returns a Promise while the module is still loading (a raw.destroy() meanwhile cancels the mount). */
    mount(opts?: RawMountOpts): void | Promise<void>;
    destroy(): void;
    handle(): Handle | null;
  };
};
// Used only inside page functions: `(window as unknown as ConformanceWindow).__conformance`.
export type ConformanceWindow = { __conformance: ConformanceApi };

/** Game callbacks as they appear in the bench log (C06: none may arrive after destroy()). E2 adds `counter`. */
export const CALLBACK_EVENTS = ["ready", "progress", "announce", "complete", "error", "collect", "run-end", "answer", "counter"];

// ---------- Navigation ----------

export type BenchParams = { seed?: number; testHooks?: boolean; reducedMotion?: boolean; difficulty?: string; timeScale?: number };

export function benchUrl(gameId: string = DUMMY, params: BenchParams = {}): string {
  const q = new URLSearchParams();
  if (params.seed !== undefined) q.set("seed", String(params.seed));
  if (params.testHooks) q.set("testHooks", "1");
  if (params.reducedMotion !== undefined) q.set("reducedMotion", params.reducedMotion ? "1" : "0");
  if (params.difficulty !== undefined) q.set("difficulty", params.difficulty);
  if (params.timeScale !== undefined) q.set("timeScale", String(params.timeScale));
  const s = q.toString();
  return `/conformance/${gameId}${s ? `?${s}` : ""}`;
}

/** Default params: fixed seed and testHooks; run games at ×10 (the run lasts 1 s instead of 10). */
export function fastParams(variant: Variant, extra: BenchParams = {}): BenchParams {
  return { seed: SEED, testHooks: true, ...(variant.run ? { timeScale: 10 } : {}), ...extra };
}

/** Real-time params (×1): for tests that need the game to stay in `playing` for a few seconds, or a human-like bot. */
export function realParams(extra: BenchParams = {}): BenchParams {
  return { seed: SEED, testHooks: true, ...extra };
}

/** Params for tests where the steering bot plays the run: the agreed scale of the variant (×1 _dummy-run, ×3 clean-channels). */
export function botParams(variant: Variant, extra: BenchParams = {}): BenchParams {
  const scale = variant.botScale ?? 1;
  return { seed: SEED, testHooks: true, ...(scale !== 1 ? { timeScale: scale } : {}), ...extra };
}

export async function gotoBench(page: Page, gameId: string = DUMMY, params: BenchParams = { seed: SEED, testHooks: true }) {
  await page.goto(benchUrl(gameId, params));
  await page.waitForFunction(() => typeof (window as unknown as Partial<ConformanceWindow>).__conformance?.setMounted === "function", null, {
    timeout: 60_000,
  });
}

// ---------- Console ----------

export type ConsoleEntry = { type: string; text: string; url: string };

/** Browser 404 for a file under the game's assetBase: the only console error C21(c) and C32 tolerate. */
export function isAssetBase404(m: ConsoleEntry, assetBase = ASSET_BASE): boolean {
  if (!m.text.startsWith("Failed to load resource") || !m.text.includes("404")) return false;
  try {
    return new URL(m.url).pathname.startsWith(assetBase);
  } catch {
    return false;
  }
}

export function watchConsole(page: Page, assetBase = ASSET_BASE) {
  const messages: ConsoleEntry[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m) => messages.push({ type: m.type(), text: m.text(), url: m.location().url ?? "" }));
  page.on("pageerror", (e) => pageErrors.push(e.stack ?? String(e)));
  return {
    messages,
    pageErrors,
    /** console messages of type "error", except the browser's 404s under assetBase. */
    errors: () => messages.filter((m) => m.type === "error" && !isAssetBase404(m, assetBase)).map((m) => `${m.text} (${m.url})`),
  };
}

// ---------- Log and state ----------

export function readLog(page: Page): Promise<LogEntry[]> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as ConformanceWindow).__conformance.log)) as LogEntry[]);
}

export function logLength(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.log.length);
}

/** Waits until `event` appears in the log at an index >= from. Returns that index. */
export async function waitForLogEvent(page: Page, event: string, from: number, timeout: number): Promise<number> {
  const handle = await page.waitForFunction(
    ([ev, start]) => {
      const log = (window as unknown as ConformanceWindow).__conformance.log;
      for (let i = start; i < log.length; i++) if (log[i].event === ev) return i + 1;
      return 0;
    },
    [event, from] as const,
    { timeout },
  );
  return (await handle.jsonValue()) - 1;
}

export function wrapperState(page: Page): Promise<string | null> {
  return page.evaluate((sel) => document.querySelector<HTMLElement>(sel)?.dataset.state ?? null, GAME_ROOT);
}

export async function waitForState(page: Page, state: WrapperState, timeout = 60_000) {
  await page.waitForFunction(([sel, s]) => document.querySelector<HTMLElement>(sel)?.dataset.state === s, [GAME_ROOT, state] as const, { timeout });
}

export function startButton(page: Page) {
  return page.getByRole("button", { name: "Empezar", exact: true });
}

/** Clicks "Empezar" and waits for `ready` in the log and the wrapper in `playing`. */
export async function startGame(page: Page, timeout = 60_000) {
  const from = await logLength(page);
  await startButton(page).click();
  await waitForLogEvent(page, "ready", from, timeout);
  await waitForState(page, "playing", timeout);
}

/** "No callback after destroy": anchor = last `destroyed` at index >= callIndex, else the call itself (as in T2). */
export function callbacksAfterDestroy(log: LogEntry[], callIndex: number) {
  let anchor = callIndex - 1;
  for (let i = callIndex; i < log.length; i++) if (log[i].event === "destroyed") anchor = i;
  return {
    anchor,
    destroyedLogged: anchor >= callIndex,
    offending: log.map((e, i) => ({ ...e, i })).filter((e) => e.i > anchor && CALLBACK_EVENTS.includes(e.event)),
  };
}

export function canvasCount(page: Page, within?: string): Promise<number> {
  return page.evaluate((sel) => (sel ? document.querySelector(sel)?.querySelectorAll("canvas").length ?? 0 : document.querySelectorAll("canvas").length), within ?? null);
}

// ---------- Hooks (testHooks) ----------

export function debugRun(page: Page, which: "stage" | "raw" = "stage"): Promise<DebugRun | null> {
  return page.evaluate((w) => {
    const c = (window as unknown as ConformanceWindow).__conformance;
    const h = w === "raw" ? c.raw.handle() : c.handle();
    const r = h?.debugRun?.() ?? null;
    return r ? (JSON.parse(JSON.stringify(r)) as DebugRun) : null;
  }, which);
}

export function debugMotion(page: Page, which: "stage" | "raw" = "stage"): Promise<DebugMotion | null> {
  return page.evaluate((w) => {
    const c = (window as unknown as ConformanceWindow).__conformance;
    const h = w === "raw" ? c.raw.handle() : c.handle();
    const m = h?.debugMotion?.() ?? null;
    return m ? (JSON.parse(JSON.stringify(m)) as DebugMotion) : null;
  }, which);
}

export function debugScene(page: Page, which: "stage" | "raw" = "stage"): Promise<DebugScene | null> {
  return page.evaluate((w) => {
    const c = (window as unknown as ConformanceWindow).__conformance;
    const h = w === "raw" ? c.raw.handle() : c.handle();
    const s = h?.debugScene?.() ?? null;
    return s ? (JSON.parse(JSON.stringify(s)) as DebugScene) : null;
  }, which);
}

// ---------- Playing `_dummy` with the keyboard (arrows change the selected target, Enter/Space activate it) ----------

function progressCount(log: LogEntry[]) {
  return log.filter((e) => e.event === "progress").length;
}

const completeCount = (log: LogEntry[]) => log.filter((e) => e.event === "complete").length;

/**
 * Completes the single-phase game with the keyboard, focus on `stageSelector`: Enter; if no new `progress` arrives
 * within `settleMs`, ArrowRight and Enter again. Stops at a NEW `complete` (the log keeps earlier games). Returns the log.
 */
export async function completeWithKeyboard(page: Page, stageSelector = STAGE, settleMs = 400, maxInputs = 40): Promise<LogEntry[]> {
  await page.locator(stageSelector).focus();
  const baseline = completeCount(await readLog(page));
  for (let i = 0; i < maxInputs; i++) {
    const before = await readLog(page);
    if (completeCount(before) > baseline) return before;
    await page.keyboard.press("Enter");
    const progressed = await page
      .waitForFunction((n) => (window as unknown as ConformanceWindow).__conformance.log.filter((e) => e.event === "progress").length > n, progressCount(before), {
        timeout: settleMs,
      })
      .then(() => true)
      .catch(() => false);
    if (!progressed) await page.keyboard.press("ArrowRight");
  }
  const log = await readLog(page);
  if (completeCount(log) <= baseline) throw new Error(`no se completó con teclado en ${maxInputs} inputs`);
  return log;
}

// ---------- Playing `_dummy-run`: steering bot, review ----------

export type InputMode = "keyboard" | "mouse" | "touch";

/** id → correct answer, from debugRun().items (the planned schedule). Must be read while the game is alive (playing). */
export async function captureAnswers(page: Page, which: "stage" | "raw" = "stage"): Promise<Record<string, string>> {
  const run = await debugRun(page, which);
  if (!run) throw new Error("debugRun() devolvió null mientras se jugaba");
  return Object.fromEntries(run.items.filter((i) => i.kind === "item" && i.answer).map((i) => [i.id, i.answer as string]));
}

type SteerFrame = {
  run: DebugRun | null;
  canvas: { left: number; top: number; width: number; height: number; logicalW: number; logicalH: number } | null;
  stage: { left: number; top: number } | null;
  targets: { id: string; x: number; y: number }[];
};

/**
 * Steers the player until the run ends. policy "all": go for the next uncollected item (by arriveAt) through
 * `mode`; "left": hold ArrowLeft the whole run (never collects, E1 path to total 0); "targets": aim at the given ids
 * (items or obstacles) in order and stop once all of them are resolved. Uses debugTargets() positions for the pointer
 * when the target is visible, else the logical x mapped to the canvas. `which`: the bench's React handle or the raw one.
 */
export async function steerRun(
  page: Page,
  mode: InputMode,
  policy: "all" | "left" | "targets" = "all",
  stageSelector = STAGE,
  opts: { targets?: string[]; which?: "stage" | "raw"; aimX?: number } = {},
) {
  const which = opts.which ?? "stage";
  const frame = () =>
    page.evaluate(([sel, w]) => {
      const c = (window as unknown as ConformanceWindow).__conformance;
      const h = w === "raw" ? c.raw.handle() : c.handle();
      const run = h?.debugRun?.() ?? null;
      const canvasEl = document.querySelector(sel)?.querySelector("canvas") ?? null;
      const stageEl = document.querySelector(sel);
      const r = canvasEl?.getBoundingClientRect();
      const s = stageEl?.getBoundingClientRect();
      return {
        run: run ? JSON.parse(JSON.stringify(run)) : null,
        canvas: r && canvasEl ? { left: r.left, top: r.top, width: r.width, height: r.height, logicalW: canvasEl.width, logicalH: canvasEl.height } : null,
        stage: s ? { left: s.left, top: s.top } : null,
        targets: (h?.debugTargets?.() ?? []).map((t) => ({ id: t.id, x: t.x, y: t.y })),
      } as SteerFrame;
    }, [stageSelector, which] as const);

  let held: string | null = null;
  let pressed = false;
  let cdp: Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>> | null = null;
  // "left" must hold ArrowLeft the WHOLE run (E1 path to total 0): press first, before anything else takes time.
  if (policy === "left") {
    await page.locator(stageSelector).focus();
    await page.keyboard.down("ArrowLeft");
  }
  // Canvas centered in the viewport: pointer coordinates must land on it, and an off-screen stage is auto-paused.
  await page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r) window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, behavior: "instant" });
  }, stageSelector);
  await page.waitForTimeout(policy === "left" ? 0 : 250);
  if (mode === "keyboard" && policy !== "left") await page.locator(stageSelector).focus();
  try {
    for (let i = 0; i < 4_000; i++) {
      const f = await frame();
      if (!f.run || f.run.ended) break;
      if (policy === "left") {
        await page.waitForTimeout(30);
        continue;
      }
      const pending =
        policy === "targets"
          ? (opts.targets ?? []).map((id) => f.run?.items.find((it) => it.id === id)).filter((it): it is DebugRunItem => !!it && it.resolvedAt === null)
          : f.run.items.filter((it) => it.kind === "item" && !it.collected && it.resolvedAt === null).sort((a, b) => a.arriveAt - b.arriveAt);
      const next = pending[0];
      if (!next && policy === "targets") break;
      if (!next || !f.canvas) {
        await page.waitForTimeout(30);
        continue;
      }
      // "targets" with aimX: hold that x (logical px) until every target is resolved, instead of chasing each one.
      const dx = (policy === "targets" && opts.aimX !== undefined ? opts.aimX : next.x) - f.run.player.x;
      if (mode === "keyboard") {
        const tolerance = f.run.kinematics.pickupHalfWidth * (next.kind === "obstacle" ? 0.2 : 0.4);
        const want = Math.abs(dx) <= tolerance ? null : dx < 0 ? "ArrowLeft" : "ArrowRight";
        if (want !== held) {
          if (held) await page.keyboard.up(held);
          if (want) await page.keyboard.down(want);
          held = want;
        }
      } else {
        const visible = f.targets.find((t) => t.id === next.id);
        const x = visible && f.stage ? f.stage.left + visible.x : f.canvas.left + (next.x * f.canvas.width) / f.canvas.logicalW;
        const y = f.canvas.top + (f.run.player.y * f.canvas.height) / f.canvas.logicalH;
        if (mode === "mouse") {
          await page.mouse.move(x, y);
          if (!pressed) await page.mouse.down();
          pressed = true;
        } else {
          if (!cdp) cdp = await page.context().newCDPSession(page);
          if (!pressed) {
            const px = f.canvas.left + (f.run.player.x * f.canvas.width) / f.canvas.logicalW;
            const dir = dx < 0 ? -1 : 1;
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: px, y }] });
            // A horizontal start (|dx| > |dy| in the first 10 px) is what makes a touch steer.
            await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: px + dir * 14, y }] });
            pressed = true;
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
        }
      }
      await page.waitForTimeout(30);
    }
  } finally {
    if (held) await page.keyboard.up(held);
    if (policy === "left") await page.keyboard.up("ArrowLeft");
    if (pressed && mode === "mouse") await page.mouse.up();
    if (cdp) {
      if (pressed) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    }
  }
}

async function activate(page: Page, selector: string, mode: InputMode) {
  const el = page.locator(selector).first();
  if (mode === "keyboard") {
    await el.focus();
    await page.keyboard.press("Enter");
  } else if (mode === "touch") await el.tap();
  else await el.click();
}

export type ReviewAnswer = { id: string; chose: string; correct: string; wantCorrect: boolean; logFrom: number; logTo: number };

/**
 * Answers the review one item at a time until `result`. choose(i) decides whether item i gets the correct option or a
 * wrong one. Returns what was answered, with the log segment [logFrom, logTo) of each answer (C26).
 */
export async function answerReview(page: Page, answers: Record<string, string>, mode: InputMode = "keyboard", choose: (i: number) => boolean = () => true) {
  const done: ReviewAnswer[] = [];
  for (let i = 0; i < 60; i++) {
    const state = await wrapperState(page);
    if (state === "result") return done;
    if (state !== "review") {
      await page.waitForTimeout(50);
      continue;
    }
    const item = page.locator(REVIEW_ITEM).first();
    await item.waitFor({ state: "visible", timeout: 10_000 });
    const id = (await item.getAttribute("data-item-id")) ?? "";
    const options = await page
      .locator(`[data-testid^="${REVIEW_OPTION_PREFIX}"]`)
      .evaluateAll((els, prefix) => els.map((e) => (e.getAttribute("data-testid") ?? "").slice(prefix.length)), REVIEW_OPTION_PREFIX);
    const correct = answers[id];
    if (!correct) throw new Error(`review-item data-item-id="${id}" no está en debugRun().items`);
    const wantCorrect = choose(done.length);
    const chose = wantCorrect ? correct : options.find((o) => o !== correct) ?? correct;
    const logFrom = await logLength(page);
    await activate(page, `[data-testid="${REVIEW_OPTION_PREFIX}${chose}"]`, mode);
    await page.locator(REVIEW_FEEDBACK).first().waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(100);
    const logTo = await logLength(page);
    done.push({ id, chose, correct, wantCorrect, logFrom, logTo });
    await activate(page, REVIEW_NEXT, mode);
    await page.waitForFunction(
      ([root, itemSel, prev]) =>
        document.querySelector<HTMLElement>(root)?.dataset.state === "result" || document.querySelector(itemSel)?.getAttribute("data-item-id") !== prev,
      [GAME_ROOT, REVIEW_ITEM, id] as const,
      { timeout: 10_000 },
    );
  }
  throw new Error("la revisión no llegó a result");
}

// ---------- Playing `_dummy-scene` (E2): crosshair with arrows + Enter/Space, or the pointer on debugTargets() ----------

/** Centers the stage in the viewport (pointer coordinates must land on it; an off-screen stage is auto-paused). */
export async function centerStage(page: Page, stageSelector = STAGE) {
  await page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r) window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, behavior: "instant" });
  }, stageSelector);
}

/**
 * Moves the crosshair with single arrow presses (each one a press of a few ms: one step) until it is within half a
 * step of (x, y) in scene px, reading debugScene().crosshair after every press. Focus on `stageSelector`.
 */
export async function moveCrosshair(page: Page, x: number, y: number, stageSelector = STAGE, which: "stage" | "raw" = "stage") {
  await page.locator(stageSelector).focus();
  for (let i = 0; i < 300; i++) {
    const s = await debugScene(page, which);
    if (!s) throw new Error("debugScene() devolvió null mientras se movía la mira");
    const half = s.crosshair.step / 2;
    const dx = x - s.crosshair.x;
    const dy = y - s.crosshair.y;
    if (Math.abs(dx) <= half && Math.abs(dy) <= half) return s.crosshair;
    const horizontal = Math.abs(dx) > half && (Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) <= half);
    const key = horizontal ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : dy < 0 ? "ArrowUp" : "ArrowDown";
    await page.keyboard.press(key);
    const moved = await page
      .waitForFunction(
        ([w, cx, cy]) => {
          const c = (window as unknown as ConformanceWindow).__conformance;
          const scene = (w === "raw" ? c.raw.handle() : c.handle())?.debugScene?.();
          return !scene || scene.crosshair.x !== cx || scene.crosshair.y !== cy;
        },
        [which, s.crosshair.x, s.crosshair.y] as const,
        { timeout: 2_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!moved) throw new Error(`la mira no se movió con ${key} desde (${s.crosshair.x}, ${s.crosshair.y})`);
  }
  throw new Error(`la mira no llegó a (${x}, ${y}) en 300 pulsaciones`);
}

/** Marks zone `id` through `mode`: keyboard = crosshair + Enter; mouse/touch = click/tap on its debugTargets() center. */
export async function markZone(page: Page, id: string, mode: InputMode, stageSelector = STAGE, which: "stage" | "raw" = "stage") {
  if (mode === "keyboard") {
    const s = await debugScene(page, which);
    const zone = s?.zones.find((z) => z.id === id);
    if (!zone) throw new Error(`zona ${id} no está en debugScene().zones`);
    await moveCrosshair(page, zone.x, zone.y, stageSelector, which);
    await page.keyboard.press("Enter");
  } else {
    const [targets, box] = await Promise.all([
      page.evaluate((w) => {
        const c = (window as unknown as ConformanceWindow).__conformance;
        return ((w === "raw" ? c.raw.handle() : c.handle())?.debugTargets?.() ?? []).map((t) => ({ id: t.id, x: t.x, y: t.y }));
      }, which),
      page.locator(stageSelector).boundingBox(),
    ]);
    const t = targets.find((x) => x.id === id);
    if (!t || !box) throw new Error(`zona ${id} no está en debugTargets() (o no hay escenario)`);
    if (mode === "mouse") await page.mouse.click(box.x + t.x, box.y + t.y);
    else await page.touchscreen.tap(box.x + t.x, box.y + t.y);
  }
  // Marked, or the phase ended (the last mark ends it in the same frame and the canvas is destroyed).
  const marked = await page
    .waitForFunction(
      ([w, zoneId]) => {
        const c = (window as unknown as ConformanceWindow).__conformance;
        const scene = (w === "raw" ? c.raw.handle() : c.handle())?.debugScene?.();
        return !scene || scene.ended || !!scene.zones.find((z) => z.id === zoneId)?.marked;
      },
      [which, id] as const,
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!marked) throw new Error(`la zona ${id} no quedó marcada con ${mode}`);
}

export type MarkSegment = { id: string; kind: "signal" | "decoy"; logFrom: number; logTo: number };

/**
 * Marks the zones `ids` in order through `mode` (stage centered first) and returns the log segment [logFrom, logTo) of
 * each mark (C26). `afterMark` runs after each mark (C28 checks the DOM there); `gapMs` waits after it.
 */
export async function playScene(
  page: Page,
  variant: Variant,
  ids: string[],
  mode: InputMode = "keyboard",
  opts: { stageSelector?: string; which?: "stage" | "raw"; gapMs?: number; afterMark?: (segment: MarkSegment) => Promise<void> } = {},
) {
  const stageSelector = opts.stageSelector ?? STAGE;
  const kinds = new Map(loadSceneData(variant).ZONES.map((z) => [z.id, z.kind]));
  await centerStage(page, stageSelector);
  await page.waitForTimeout(250);
  const segments: MarkSegment[] = [];
  for (const id of ids) {
    const kind = kinds.get(id);
    if (!kind) throw new Error(`zona ${id} no está en data.ts ZONES`);
    const logFrom = await logLength(page);
    await markZone(page, id, mode, stageSelector, opts.which ?? "stage");
    await page.waitForTimeout(150);
    const segment = { id, kind, logFrom, logTo: await logLength(page) };
    segments.push(segment);
    if (opts.afterMark) await opts.afterMark(segment);
    if (opts.gapMs) await page.waitForTimeout(opts.gapMs);
  }
  return segments;
}

/** Answers of the scene's review for answerReview(): its single item and the correct option (data.ts QUESTION). */
export function sceneAnswers(variant: Variant): Record<string, string> {
  const { QUESTION } = loadSceneData(variant);
  return { [QUESTION.id]: QUESTION.answer };
}

/** Ids of the scene's zones of one kind, in data.ts order. */
export function sceneZoneIds(variant: Variant, kind: "signal" | "decoy"): string[] {
  return loadSceneData(variant)
    .ZONES.filter((z) => z.kind === kind)
    .map((z) => z.id);
}

export type FinishOptions = { mode?: InputMode; steer?: "none" | "all" | "left"; choose?: (i: number) => boolean; marks?: string[] };

/**
 * Plays the current game to `result`, starting while it is in `playing`. Single-phase: completes with the keyboard.
 * Run game: steering policy (default none), wait for `run-end`, then answers the review (default: all correct).
 * Scene game: marks `marks` (default: every signal), waits for `run-end`, then answers the review. Returns the log.
 */
export async function finishGame(page: Page, variant: Variant, opts: FinishOptions = {}): Promise<LogEntry[]> {
  if (variant.scene) {
    const mode = opts.mode ?? "keyboard";
    const runEnds = (await readLog(page)).filter((e) => e.event === "run-end").length;
    await playScene(page, variant, opts.marks ?? sceneZoneIds(variant, "signal"), mode);
    await page.waitForFunction((n) => (window as unknown as ConformanceWindow).__conformance.log.filter((e) => e.event === "run-end").length > n, runEnds, {
      timeout: 30_000,
    });
    await answerReview(page, sceneAnswers(variant), mode, opts.choose);
    await waitForState(page, "result", 10_000);
    return readLog(page);
  }
  if (!variant.run) return completeWithKeyboard(page);
  const mode = opts.mode ?? "keyboard";
  const answers = await captureAnswers(page);
  const runEnds = (await readLog(page)).filter((e) => e.event === "run-end").length;
  if (opts.steer && opts.steer !== "none") await steerRun(page, mode, opts.steer);
  await page.waitForFunction((n) => (window as unknown as ConformanceWindow).__conformance.log.filter((e) => e.event === "run-end").length > n, runEnds, {
    timeout: 90_000,
  });
  await answerReview(page, answers, mode, opts.choose);
  await waitForState(page, "result", 10_000);
  return readLog(page);
}

// ---------- Manifest, coder modules and generated assets ----------

export type ManifestEntry = {
  key: string;
  file: string;
  type: "image" | "spritesheet";
  width: number;
  height: number;
  format: string;
  frames: null | { count: number; frameWidth: number; frameHeight: number };
};

export function readManifest(dir = DUMMY_DIR): ManifestEntry[] {
  return JSON.parse(fs.readFileSync(path.join(MODULES_ROOT, dir, "assets.manifest.json"), "utf8")) as ManifestEntry[];
}

/**
 * Loads a coder module by file path at run time (see header). Goes through `require` so Playwright transpiles it and
 * resolves the `@/` alias of tsconfig inside it (a native import() of a file URL does not).
 */
export function importModule<T>(relPath: string): T {
  return createRequire(__filename)(path.resolve(MODULES_ROOT, relPath)) as T;
}

export type ZodLike = { safeParse(value: unknown): { success: boolean; error?: unknown } };
export type GameMeta = {
  total: number;
  learning: string;
  backgroundProbe: { x: number; y: number };
  controls: { keyboard: string };
  essentialMotion: boolean;
  difficulties?: { id: string; label: string; total: number }[];
  defaultDifficulty?: string;
  emptyResult?: { title: string; text: string; when?: "total" | "hits" };
  // E2 (optional, additive).
  hitsFrom?: "review" | "game";
  textPanel?: boolean;
  counterLabel?: string;
  stillWithoutInput?: boolean;
};
export type DummyMeta = GameMeta;
export type ProgressEntry = { completed: boolean; hits: number; total: number; score: number; savedAt: string };

export async function loadContract() {
  return importModule<{ gameResultSchema: ZodLike; progressEntrySchema: ZodLike }>("lib/games/contract.ts");
}

export async function loadMeta(variant: Variant = DUMMY_VARIANT): Promise<GameMeta> {
  const { meta } = importModule<{ meta?: GameMeta }>(`${variant.dir}/meta.ts`);
  if (!meta) throw new Error(`${variant.dir}/meta.ts no exporta meta`);
  return meta;
}

export async function loadDummyMeta(): Promise<GameMeta> {
  return loadMeta(DUMMY_VARIANT);
}

export type BuiltRun = {
  difficulty: string;
  layout: "landscape" | "portrait";
  durationMs: number;
  kinematics: { playerSpeed: number; pickupHalfWidth: number; visibleMs: number; playerMinX: number; playerMaxX: number };
  items: { id: string; kind: "item" | "obstacle"; type: string; x: number; arriveAt: number; answer: string | null }[];
};
export type BuildRun = (opts: { difficulty: string; seed: number; layout: "landscape" | "portrait" }) => BuiltRun;

/** lib/games/<id>/data.ts → buildRun (pure, no Phaser), for games with hasBuildRun. */
export function loadBuildRun(variant: Variant): BuildRun {
  const { buildRun } = importModule<{ buildRun?: BuildRun }>(`${variant.dir}/data.ts`);
  if (typeof buildRun !== "function") throw new Error(`${variant.dir}/data.ts no exporta buildRun`);
  return buildRun;
}

export type SceneData = {
  ZONES: { id: string; kind: "signal" | "decoy"; x: number; y: number; r: number; points: number }[];
  MARKS: Record<string, number>;
  SCENE: { width: number; height: number };
  CROSSHAIR: { startX: number; startY: number; step: number };
  QUESTION: { id: string; answer: string };
  scoreOf(markedIds: string[]): { hits: number; score: number };
};

/** lib/games/<id>/data.ts of a scene game (E2): pure, importable in Node without Phaser or DOM. */
export function loadSceneData(variant: Variant): SceneData {
  const data = importModule<Partial<SceneData>>(`${variant.dir}/data.ts`);
  for (const name of ["ZONES", "MARKS", "SCENE", "CROSSHAIR", "QUESTION", "scoreOf"] as const)
    if (data[name] === undefined) throw new Error(`${variant.dir}/data.ts no exporta ${name}`);
  return data as SceneData;
}

/** First seed in [1, max] whose buildRun satisfies `ok`, or null. */
export function findSeed(buildRun: BuildRun, difficulty: string, layout: "landscape" | "portrait", ok: (run: BuiltRun) => boolean, max = 1_000): number | null {
  for (let seed = 1; seed <= max; seed++) if (ok(buildRun({ difficulty, seed, layout }))) return seed;
  return null;
}

/**
 * Seed for the "nothing collected" path (C28 empty result, C39 c): holding ArrowLeft from `ready`, the kayak sits at
 * playerMinX, so no item may arrive within pickupHalfWidth of it. Games without buildRun use the agreed dummy guarantee.
 */
export function emptySeed(variant: Variant, difficulty: string, layout: "landscape" | "portrait" = "landscape"): number | null {
  if (!variant.hasBuildRun) return SEED;
  return findSeed(loadBuildRun(variant), difficulty, layout, (run) =>
    run.items.filter((i) => i.kind === "item").every((i) => Math.abs(i.x - run.kinematics.playerMinX) > run.kinematics.pickupHalfWidth),
  );
}

export async function loadGameProgress() {
  return importModule<{ pickBest(previous: ProgressEntry | undefined, next: ProgressEntry): ProgressEntry }>("lib/storage/game-progress.ts");
}

/** Maximum result.total for the difficulty played (meta.total without difficulties), per C27. */
export function maxTotalOf(meta: GameMeta, difficulty?: string | null): number {
  return meta.difficulties?.find((d) => d.id === difficulty)?.total ?? meta.total;
}

/**
 * Real image files generated by the browser's own encoder, with exact sizes (C21, C23, C23b). Spritesheets are a
 * horizontal strip of `count` frames, each a different shade. Must run on a page with a document (any URL).
 */
export async function generateImage(page: Page, width: number, height: number, format: string, frames = 1): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([w, h, f, n]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("sin 2d");
      const fw = w / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = `hsl(${(i * 360) / n}, 80%, 50%)`;
        ctx.fillRect(i * fw, 0, fw, h);
      }
      return canvas.toDataURL(f === "png" ? "image/png" : "image/webp");
    },
    [width, height, format, frames] as const,
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

export type AssetPlan = Record<string, "404" | { width: number; height: number }>;

/**
 * Serves assetBase with Playwright interception: per file, a 404 or a generated image of the given size. Files not in
 * the plan answer 404. Must be called before the game loads. Uses `generatorPage` (a page with a document) to encode.
 */
export async function serveAssets(page: Page, plan: AssetPlan, generatorPage: Page, manifest = readManifest(), assetBase = ASSET_BASE) {
  const bodies = new Map<string, { body: Buffer; contentType: string }>();
  for (const entry of manifest) {
    const spec = plan[entry.file] ?? "404";
    if (spec === "404") continue;
    const frames = entry.frames?.count ?? 1;
    bodies.set(entry.file, { body: await generateImage(generatorPage, spec.width, spec.height, entry.format, frames), contentType: `image/${entry.format}` });
  }
  await page.route(`**${assetBase}**`, (route) => {
    const file = decodeURIComponent(new URL(route.request().url()).pathname.slice(assetBase.length));
    const served = bodies.get(file);
    return served ? route.fulfill({ status: 200, body: served.body, contentType: served.contentType }) : route.fulfill({ status: 404, body: "not found" });
  });
}

/** Plan with every manifest file present at its exact manifest size. */
export function allPresent(manifest = readManifest()): AssetPlan {
  return Object.fromEntries(manifest.map((e) => [e.file, { width: e.width, height: e.height }]));
}

// ---------- Instrumentation (injected with page.addInitScript before any page script) ----------

export type JudgeProbe = {
  __judgeProbe: {
    raf: number;
    canvasMax: number;
    canvasNow: number;
    setItems: { key: string; logLength: number; completeLogged: boolean; t: number }[];
  };
};

/** requestAnimationFrame counter (C08b), max simultaneous canvases in the document (C07), setItem calls (C14b). */
export function instrumentProbe() {
  const probe = { raf: 0, canvasMax: 0, canvasNow: 0, setItems: [] as { key: string; logLength: number; completeLogged: boolean; t: number }[] };
  (window as unknown as JudgeProbe).__judgeProbe = probe;

  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    probe.raf++;
    return origRaf(cb);
  };

  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    const log = (window as unknown as Partial<ConformanceWindow>).__conformance?.log ?? [];
    probe.setItems.push({ key, logLength: log.length, completeLogged: log.some((e) => e.event === "complete"), t: performance.now() });
    return origSetItem.call(this, key, value);
  };

  const canvasesIn = (node: Node) =>
    node.nodeName === "CANVAS" ? 1 : node instanceof Element ? node.querySelectorAll("canvas").length : 0;
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        probe.canvasNow += canvasesIn(n);
        probe.canvasMax = Math.max(probe.canvasMax, probe.canvasNow);
      });
      r.removedNodes.forEach((n) => {
        probe.canvasNow -= canvasesIn(n);
      });
    }
    // Resync with the real count so a subtree counted twice can never drift the running total.
    probe.canvasNow = document.querySelectorAll("canvas").length;
    probe.canvasMax = Math.max(probe.canvasMax, probe.canvasNow);
  }).observe(document, { childList: true, subtree: true });
}

export function readProbe(page: Page) {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as JudgeProbe).__judgeProbe)) as JudgeProbe["__judgeProbe"]);
}

export type JudgeRunProbe = {
  __judgeRun: {
    collectTexts: { t: number; text: string }[];
    scoreTexts: { t: number; text: string }[];
    canvasInReviewOrResult: { t: number; state: string; count: number }[];
    states: { t: number; state: string }[];
  };
};

/**
 * Run games (E1): text history of the run marker (C28) and of the score (C28), canvases seen while the wrapper is in
 * `review` or `result` (C33), and wrapper state changes. Everything stamped with performance.now() (same clock as log.t).
 */
export function instrumentRun() {
  const rec = {
    collectTexts: [] as { t: number; text: string }[],
    scoreTexts: [] as { t: number; text: string }[],
    canvasInReviewOrResult: [] as { t: number; state: string; count: number }[],
    states: [] as { t: number; state: string }[],
  };
  (window as unknown as JudgeRunProbe).__judgeRun = rec;
  let lastCollect: string | null = null;
  let lastScore: string | null = null;
  let lastState: string | null = null;
  const check = () => {
    const t = performance.now();
    const collect = document.querySelector('[data-testid="collect"]')?.textContent ?? null;
    if (collect !== lastCollect) {
      lastCollect = collect;
      if (collect !== null) rec.collectTexts.push({ t, text: collect });
    }
    const score = document.querySelector('[data-testid="score"]')?.textContent ?? null;
    if (score !== lastScore) {
      lastScore = score;
      if (score !== null) rec.scoreTexts.push({ t, text: score });
    }
    const state = document.querySelector<HTMLElement>('[data-testid="game-stage"]')?.dataset.state ?? null;
    if (state !== lastState) {
      lastState = state;
      if (state !== null) rec.states.push({ t, state });
    }
    if (state === "review" || state === "result") {
      const count = document.querySelectorAll("canvas").length;
      if (count > 0) rec.canvasInReviewOrResult.push({ t, state, count });
    }
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-state"] });
}

export function readRunProbe(page: Page) {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as JudgeRunProbe).__judgeRun)) as JudgeRunProbe["__judgeRun"]);
}

/**
 * PNG of the stage's canvas through CDP Page.captureScreenshot with document coordinates and captureBeyondViewport:
 * works with the canvas OFF screen without scrolling to it, so C08c can capture while the stage is out of the viewport.
 * Caveat: the capture may enlarge the viewport for an instant (measured by the coder in T3+T4; a bare probe of mine
 * saw no IntersectionObserver entry), which the wrapper filters by ignoring visibility changes under 150 ms.
 * Returns base64.
 */
export async function canvasShot(page: Page, stageSelector = STAGE): Promise<string> {
  const clip = await page.evaluate((sel) => {
    const canvas = document.querySelector(sel)?.querySelector("canvas");
    if (!canvas) throw new Error("sin canvas en el escenario");
    const r = canvas.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height, scale: 1 };
  }, stageSelector);
  const cdp = await page.context().newCDPSession(page);
  try {
    return (await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip })).data;
  } finally {
    await cdp.detach();
  }
}

/** rAF calls during `ms`, counted in the page with timers only (no rAF of our own). */
export function countRaf(page: Page, ms = 1_000): Promise<number> {
  return page.evaluate(async (d) => {
    const p = (window as unknown as JudgeProbe).__judgeProbe;
    const start = p.raf;
    await new Promise((r) => setTimeout(r, d));
    return p.raf - start;
  }, ms);
}
