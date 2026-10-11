// JUDGE (tests/conformance): shared helpers for the T3 + T4 suite (checklist §2.6, items W) against the `_dummy` game.
// Talks to the page only through the fixed interface of the ticket: /conformance/[gameId], window.__conformance and
// the data-testid list. Coder modules (contract.ts, meta.ts) are imported by file path at run time, never statically,
// so a renamed export can never break the coder's `tsc` or `next build` (C01).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Page } from "@playwright/test";

export const DUMMY = "_dummy";
export const ASSET_BASE = `/games/${DUMMY}/`;
export const DUMMY_DIR = `lib/games/${DUMMY}`;
export const SHARED_DIR = "lib/games/shared";
export const SEED = 7;

export const GAME_ROOT = '[data-testid="game-stage"]';
export const STAGE = '[data-testid="stage"]';
export const RAW_STAGE = '[data-testid="raw-stage"]';
export const BOX = '[data-testid="box"]';
export const SCORE = '[data-testid="score"]';
export const LIVE = '[data-testid="live"]';
export const RESULT_TITLE = '[data-testid="result-title"]';

export type WrapperState = "coming-soon" | "intro" | "loading" | "playing" | "result" | "error";
export type LogEntry = { t: number; event: string; payload?: unknown };
export type DebugTexture = { key: string; width: number; height: number; frames: number; source: string };
export type Handle = {
  destroy(): void;
  pause(): void;
  resume(): void;
  setTheme(theme: "dark" | "light", tokens: Record<string, string>): void;
  debugTargets?(): { id: string; x: number; y: number }[];
  debugTextures?(): DebugTexture[];
};
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
    mount(opts?: { seed?: number; reducedMotion?: boolean; theme?: "dark" | "light"; testHooks?: boolean }): void | Promise<void>;
    destroy(): void;
    handle(): Handle | null;
  };
};
// Used only inside page functions: `(window as unknown as ConformanceWindow).__conformance`.
export type ConformanceWindow = { __conformance: ConformanceApi };

/** Game callbacks as they appear in the bench log (C06: none may arrive after destroy()). */
export const CALLBACK_EVENTS = ["ready", "progress", "announce", "complete", "error"];

// ---------- Navigation ----------

export type BenchParams = { seed?: number; testHooks?: boolean; reducedMotion?: boolean };

export function benchUrl(gameId: string = DUMMY, params: BenchParams = {}): string {
  const q = new URLSearchParams();
  if (params.seed !== undefined) q.set("seed", String(params.seed));
  if (params.testHooks) q.set("testHooks", "1");
  if (params.reducedMotion !== undefined) q.set("reducedMotion", params.reducedMotion ? "1" : "0");
  const s = q.toString();
  return `/conformance/${gameId}${s ? `?${s}` : ""}`;
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

// ---------- Playing with the keyboard (arrows change the selected target, Enter/Space activate it) ----------

function progressCount(log: LogEntry[]) {
  return log.filter((e) => e.event === "progress").length;
}

const completeCount = (log: LogEntry[]) => log.filter((e) => e.event === "complete").length;

/**
 * Completes the game with the keyboard, focus on `stageSelector`: Enter; if no new `progress` arrives within
 * `settleMs`, ArrowRight and Enter again. Stops at a NEW `complete` (the log keeps earlier games). Returns the log.
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
  return JSON.parse(fs.readFileSync(path.join(dir, "assets.manifest.json"), "utf8")) as ManifestEntry[];
}

/**
 * Loads a coder module by file path at run time (see header). Goes through `require` so Playwright transpiles it and
 * resolves the `@/` alias of tsconfig inside it (a native import() of a file URL does not).
 */
export function importModule<T>(relPath: string): T {
  return createRequire(__filename)(path.resolve(process.cwd(), relPath)) as T;
}

export type ZodLike = { safeParse(value: unknown): { success: boolean; error?: unknown } };
export type DummyMeta = { total: number; learning: string; backgroundProbe: { x: number; y: number }; controls: { keyboard: string } };
export type ProgressEntry = { completed: boolean; hits: number; total: number; savedAt: string };

export async function loadContract() {
  return importModule<{ gameResultSchema: ZodLike; progressEntrySchema: ZodLike }>("lib/games/contract.ts");
}

export async function loadDummyMeta(): Promise<DummyMeta> {
  const { meta } = importModule<{ meta?: DummyMeta }>(`${DUMMY_DIR}/meta.ts`);
  if (!meta) throw new Error(`${DUMMY_DIR}/meta.ts no exporta meta`);
  return meta;
}

export async function loadGameProgress() {
  return importModule<{ pickBest(previous: ProgressEntry | undefined, next: ProgressEntry): ProgressEntry }>("lib/storage/game-progress.ts");
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
export async function serveAssets(page: Page, plan: AssetPlan, generatorPage: Page, manifest = readManifest()) {
  const bodies = new Map<string, { body: Buffer; contentType: string }>();
  for (const entry of manifest) {
    const spec = plan[entry.file] ?? "404";
    if (spec === "404") continue;
    const frames = entry.frames?.count ?? 1;
    bodies.set(entry.file, { body: await generateImage(generatorPage, spec.width, spec.height, entry.format, frames), contentType: `image/${entry.format}` });
  }
  await page.route(`**${ASSET_BASE}**`, (route) => {
    const file = decodeURIComponent(new URL(route.request().url()).pathname.slice(ASSET_BASE.length));
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

/**
 * PNG of the stage's canvas through CDP Page.captureScreenshot with document coordinates and captureBeyondViewport:
 * works with the canvas OFF screen without scrolling to it (checked: no IntersectionObserver entry fires), so C08c can
 * capture while the stage is out of the viewport. Returns base64.
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
