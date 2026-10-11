// JUDGE (tests/conformance): shared helpers for the T2 spike suite (S1–S10). Talks to the page only through the fixed
// interface of the ticket: /spike, [data-testid="stage"] and window.__spike.
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const SPIKE_URL = "/spike";
export const STAGE = '[data-testid="stage"]';
// Missing on purpose (ticket T2): its 404 is the only console error the criteria tolerate.
export const MISSING_ASSET = "/games/_spike/missing.webp";
export const SPIKE_DIR = "lib/games/_spike";

export type SpikeLogEntry = { t: number; event: string };
export type SpikeApi = {
  mount(opts?: { reducedMotion?: boolean }): unknown;
  unmount(): unknown;
  raw: { mount(): void; destroy(): void };
  renderer(): "WEBGL" | "CANVAS" | null;
  resizeStage(width: number, height: number): unknown;
  log: SpikeLogEntry[];
};
// Used only inside page functions: `(window as unknown as SpikeWindow).__spike`. No global augmentation on purpose,
// so these files never clash with the coder's own `Window` typings during `next build`.
export type SpikeWindow = { __spike: SpikeApi };

// ---------- Console and page errors ----------

export type ConsoleEntry = { type: string; text: string; url: string };

export function watchConsole(page: Page) {
  const messages: ConsoleEntry[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m) => messages.push({ type: m.type(), text: m.text(), url: m.location().url ?? "" }));
  page.on("pageerror", (e) => pageErrors.push(e.stack ?? String(e)));
  return {
    messages,
    pageErrors,
    /** console messages of type "error", except the browser's 404 for MISSING_ASSET. */
    errors: () => messages.filter((m) => m.type === "error" && !isExpectedMissing404(m)),
  };
}

export function isExpectedMissing404(m: ConsoleEntry): boolean {
  if (!m.text.startsWith("Failed to load resource") || !m.text.includes("404")) return false;
  try {
    return new URL(m.url).pathname === MISSING_ASSET;
  } catch {
    return false;
  }
}

// ---------- Spike interface ----------

export async function gotoSpike(page: Page) {
  await page.goto(SPIKE_URL);
  await page.waitForFunction(() => typeof (window as unknown as Partial<SpikeWindow>).__spike?.mount === "function", null, {
    timeout: 60_000,
  });
}

export function readLog(page: Page): Promise<SpikeLogEntry[]> {
  return page.evaluate(() => [...(window as unknown as SpikeWindow).__spike.log]);
}

export async function logLength(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as SpikeWindow).__spike.log.length);
}

/** Waits until `event` appears in __spike.log at an index >= `from`. Returns that index. */
export async function waitForLogEvent(page: Page, event: string, from: number, timeout: number): Promise<number> {
  const handle = await page.waitForFunction(
    ([ev, start]) => {
      const log = (window as unknown as SpikeWindow).__spike.log;
      for (let i = start; i < log.length; i++) if (log[i].event === ev) return i + 1;
      return 0;
    },
    [event, from] as const,
    { timeout },
  );
  return (await handle.jsonValue()) - 1;
}

/** Best-effort sync point (never fails): waits for `destroyed` at index >= from, or `timeout` ms. */
export async function settleDestroyed(page: Page, from: number, timeout = 1_000) {
  await waitForLogEvent(page, "destroyed", from, timeout).catch(() => undefined);
}

export async function mountAndWaitReady(page: Page, timeout = 60_000): Promise<number> {
  const from = await logLength(page);
  await page.evaluate(() => {
    (window as unknown as SpikeWindow).__spike.mount();
  });
  return waitForLogEvent(page, "ready", from, timeout);
}

export async function unmountAndSettle(page: Page) {
  const from = await logLength(page);
  await page.evaluate(() => {
    (window as unknown as SpikeWindow).__spike.unmount();
  });
  await settleDestroyed(page, from);
}

export function canvasCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("canvas").length);
}

/**
 * "No ready after destroyed", robust to Strict Mode: anchor = the LAST `destroyed` at index >= callIndex (the destroy
 * issued by the test; a Strict Mode simulated unmount earlier in the log is followed by a legitimate `ready`). If no
 * `destroyed` was logged after the call, the anchor is the call itself. Returns the offending entries.
 */
export function readyAfterDestroy(log: SpikeLogEntry[], callIndex: number) {
  let anchor = callIndex - 1;
  for (let i = callIndex; i < log.length; i++) if (log[i].event === "destroyed") anchor = i;
  return {
    anchor,
    destroyedLogged: anchor >= callIndex,
    offending: log.map((e, i) => ({ ...e, i })).filter((e) => e.i > anchor && e.event === "ready"),
  };
}

// ---------- Geometry and scroll ----------

export type Rect = { x: number; y: number; width: number; height: number };

export async function stageAndCanvasRects(page: Page): Promise<{ stage: Rect | null; canvas: Rect | null }> {
  return page.evaluate((sel) => {
    const pick = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const stage = document.querySelector(sel);
    return { stage: pick(stage), canvas: pick(stage ? stage.querySelector("canvas") : null) };
  }, STAGE);
}

export function containedWithin(inner: Rect, outer: Rect, tol = 1): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.width <= outer.x + outer.width + tol &&
    inner.y + inner.height <= outer.y + outer.height + tol
  );
}

export function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

/** Instant scroll (html has scroll-behavior: smooth) so that the canvas center sits at `fraction` of the viewport. */
export async function placeCanvasAt(page: Page, fraction: number) {
  await page.evaluate(
    ([sel, f]) => {
      const canvas = document.querySelector(sel)?.querySelector("canvas");
      if (!canvas) throw new Error("no hay canvas dentro del escenario");
      const r = canvas.getBoundingClientRect();
      const top = window.scrollY + r.top + r.height / 2 - window.innerHeight * f;
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    },
    [STAGE, fraction] as const,
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

export async function canvasCenter(page: Page): Promise<{ x: number; y: number; height: number; top: number }> {
  const { canvas } = await stageAndCanvasRects(page);
  if (!canvas) throw new Error("no hay canvas dentro del escenario");
  return { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2, height: canvas.height, top: canvas.y };
}

/** Polls until scrollY grows past `before` or `timeout` ms pass. Returns the last scrollY seen (never throws). */
export async function scrollAfter(page: Page, before: number, timeout = 3_000): Promise<number> {
  const end = Date.now() + timeout;
  let current = await scrollY(page);
  while (current <= before && Date.now() < end) {
    await page.waitForTimeout(50);
    current = await scrollY(page);
  }
  return current;
}

/** Instant scroll so that the stage's top edge sits at `fraction` of the viewport height (spacer visible above). */
export async function placeStageTopAt(page: Page, fraction: number) {
  await page.evaluate(
    ([sel, f]) => {
      const stage = document.querySelector(sel);
      if (!stage) throw new Error("no hay escenario");
      const top = window.scrollY + stage.getBoundingClientRect().top - window.innerHeight * f;
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    },
    [STAGE, fraction] as const,
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Whether the element at viewport point (x, y) is the stage or inside it. */
export function pointInStage(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ([sel, px, py]) => {
      const stage = document.querySelector(sel);
      const el = document.elementFromPoint(px, py);
      return !!(stage && el && (stage === el || stage.contains(el)));
    },
    [STAGE, x, y] as const,
  );
}

export function elementAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}` : "(nada)";
    },
    [x, y] as const,
  );
}

/** Vertical swipe through CDP Input.dispatchTouchEvent (C12). Finger moves from y0 to y1 at x. */
export async function cdpSwipe(page: Page, x: number, y0: number, y1: number, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

// ---------- Static search (equivalent of `rg <pattern> <dir>`) ----------

export type GrepHit = { file: string; line: number; text: string };

export function grepDir(dir: string, pattern: RegExp): GrepHit[] {
  const root = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(root)) throw new Error(`no existe ${dir} (rg terminaría con error)`);
  const hits: GrepHit[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const content = fs.readFileSync(full, "utf8");
        if (content.includes("\u0000")) continue; // binary, as rg
        content.split(/\r?\n/).forEach((text, i) => {
          if (pattern.test(text)) hits.push({ file: path.relative(process.cwd(), full).replaceAll("\\", "/"), line: i + 1, text: text.trim() });
        });
      }
    }
  };
  walk(root);
  return hits;
}

// ---------- Instrumentation (C09 b): injected with page.addInitScript before any page script ----------

export type ListenerEntry = { id: number; target: "window" | "document"; type: string; capture: boolean; stack: string };
export type JudgeWindow = {
  __judge: {
    snapshot(): number[];
    activeSince(snapshot: number[], types: string[]): ListenerEntry[];
    addCallsSince(snapshot: number[], types: string[]): ListenerEntry[];
  };
};

/** Records add/removeEventListener on window and document, keeping the set of active listeners (net). */
export function instrumentListeners() {
  type Active = { id: number; target: "window" | "document"; type: string; capture: boolean; stack: string; fn: unknown };
  const active: Active[] = [];
  const adds: Active[] = [];
  let nextId = 1;
  const proto = EventTarget.prototype;
  const origAdd = proto.addEventListener;
  const origRemove = proto.removeEventListener;
  const label = (t: unknown): "window" | "document" | null => (t === window ? "window" : t === document ? "document" : null);
  const captureOf = (o: unknown) => (typeof o === "boolean" ? o : !!(o && typeof o === "object" && (o as { capture?: boolean }).capture));
  proto.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) {
    const target = label(this);
    if (target && fn) {
      const capture = captureOf(opts);
      const entry = { id: nextId++, target, type, capture, stack: new Error().stack ?? "", fn };
      adds.push(entry);
      if (!active.some((a) => a.target === target && a.type === type && a.capture === capture && a.fn === fn)) active.push(entry);
    }
    return origAdd.call(this, type, fn, opts);
  } as typeof proto.addEventListener;
  proto.removeEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | EventListenerOptions) {
    const target = label(this);
    if (target && fn) {
      const capture = captureOf(opts);
      const i = active.findIndex((a) => a.target === target && a.type === type && a.capture === capture && a.fn === fn);
      if (i >= 0) active.splice(i, 1);
    }
    return origRemove.call(this, type, fn, opts);
  } as typeof proto.removeEventListener;
  const strip = (a: Active) => ({ id: a.id, target: a.target, type: a.type, capture: a.capture, stack: a.stack });
  // types: event types to report; ["*"] reports every type (C03 b counts any new listener).
  const matches = (types: string[], type: string) => types.includes("*") || types.includes(type);
  (window as unknown as JudgeWindow).__judge = {
    snapshot: () => [nextId],
    activeSince: (snap, types) => active.filter((a) => a.id >= snap[0] && matches(types, a.type)).map(strip),
    addCallsSince: (snap, types) => adds.filter((a) => a.id >= snap[0] && matches(types, a.type)).map(strip),
  };
}
