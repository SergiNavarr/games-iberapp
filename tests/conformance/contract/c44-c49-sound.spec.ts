// JUDGE · G1b paso 3 (E3b): C44 (audio only after the gesture), C45 (pause without sound), C46 (context closed at the
// end), C47 (mute), C48(b) (no audio files at run time; C48 a is in c00-static.spec.ts) and C49 (sprites in the
// review), with the readings agreed with the coordinator. Instrumentation (addInitScript, before any page script): a
// subclass of AudioContext / webkitAudioContext records each creation (time, navigator.userActivation.isActive, log
// length, the instance to read its state); suspend / resume / close, AudioScheduledSourceNode.start,
// decodeAudioData and HTMLMediaElement.play are wrapped. Chromium runs with --autoplay-policy=user-gesture-required
// (only this file's worker). Games with meta.sounds (variants.ts `sounds`, checked against meta): clean-channels;
// the others check that no context and no mute button exist. The mute button's accessible name, "Silenciar", was
// confirmed by the user (15/10/2026); it stays fixed when toggling (the state is aria-pressed).
import type { Page } from "@playwright/test";
import { watchJsBodies } from "./support-bundle";
import {
  allPresent,
  answerReview,
  botParams,
  captureAnswers,
  centerStage,
  expect,
  fastParams,
  finishGame,
  GAME_ROOT,
  gotoBench,
  hookRunEndSnapshot,
  importModule,
  loadMeta,
  logLength,
  motionAtEnd,
  readLog,
  readManifest,
  realParams,
  REVIEW,
  serveAssets,
  STAGE,
  startButton,
  startGame,
  steerRun,
  test,
  waitForLogEvent,
  waitForState,
  watchConsole,
  ALL_VARIANTS,
  DUMMY_VARIANT,
  type ConformanceWindow,
  type LogEntry,
  type Variant,
} from "./support";

test.use({ launchOptions: { args: ["--autoplay-policy=user-gesture-required"] } });

/** Accessible name of the mute button (confirmed by the user). */
const MUTE_NAME: string | null = "Silenciar";
const MUTE = '[data-testid="mute"]';
const SPRITE = '[data-testid="review-sprite"]';
const WITHIN_MS = 500;
/** C47 d: a start() this much before the log entry of its collect / answer belongs to the same handler. */
const SAME_HANDLER_MS = 20;

type AudioCtxRec = { t: number; active: boolean | null; logLength: number; state: string };
type AudioRec = {
  contexts: AudioCtxRec[];
  starts: number[];
  resumes: number;
  decode: number;
  mediaPlay: number;
  ready: { t: number; state: string | null }[];
  states: { state: string; mutePresent: boolean; muteVisible: boolean }[];
};

/** Init script: AudioContext subclass and wrappers (see header), plus the mute button seen at each data-state change. */
function instrumentAudio() {
  type Ctx = { t: number; active: boolean | null; logLength: number; ctx: AudioContext };
  const rec = {
    contexts: [] as Ctx[],
    starts: [] as number[],
    resumes: 0,
    decode: 0,
    mediaPlay: 0,
    ready: [] as { t: number; state: string | null }[],
    states: [] as { state: string; mutePresent: boolean; muteVisible: boolean }[],
  };
  const w = window as unknown as {
    __judgeAudio: typeof rec;
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
    __conformance?: { log: { length: number } };
  };
  w.__judgeAudio = rec;
  const Base = w.AudioContext ?? w.webkitAudioContext;
  if (Base) {
    class JudgeAudioContext extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        rec.contexts.push({
          t: performance.now(),
          active: (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? null,
          logLength: w.__conformance?.log.length ?? -1,
          ctx: this,
        });
      }
    }
    w.AudioContext = JudgeAudioContext;
    if (w.webkitAudioContext) w.webkitAudioContext = JudgeAudioContext;
    const resume = Base.prototype.resume;
    Base.prototype.resume = function (this: AudioContext) {
      rec.resumes++;
      return resume.call(this);
    };
  }
  const Source = (window as unknown as { AudioScheduledSourceNode?: { prototype: { start: (...a: unknown[]) => void } } }).AudioScheduledSourceNode;
  if (Source) {
    const start = Source.prototype.start;
    Source.prototype.start = function (this: unknown, ...a: unknown[]) {
      rec.starts.push(performance.now());
      return start.apply(this, a);
    };
  }
  const BaseCtx = (window as unknown as { BaseAudioContext?: { prototype: { decodeAudioData: (...a: unknown[]) => unknown } } }).BaseAudioContext;
  if (BaseCtx) {
    const decode = BaseCtx.prototype.decodeAudioData;
    BaseCtx.prototype.decodeAudioData = function (this: unknown, ...a: unknown[]) {
      rec.decode++;
      return decode.apply(this, a);
    };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    rec.mediaPlay++;
    return play.call(this);
  };
  // Mute button at each wrapper state (C47 a): loading lasts very little, so it is recorded as it happens.
  let lastState: string | null = null;
  const check = () => {
    const state = document.querySelector<HTMLElement>('[data-testid="game-stage"]')?.dataset.state ?? null;
    if (!state || state === lastState) return;
    lastState = state;
    const mute = document.querySelector<HTMLElement>('[data-testid="mute"]');
    const r = mute?.getBoundingClientRect();
    const style = mute ? getComputedStyle(mute) : null;
    rec.states.push({
      state,
      mutePresent: !!mute,
      muteVisible: !!mute && !!r && r.width > 0 && r.height > 0 && style?.visibility !== "hidden" && style?.display !== "none",
    });
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
}

async function readAudio(page: Page): Promise<AudioRec> {
  return page.evaluate(() => {
    const r = (window as unknown as { __judgeAudio: { contexts: { t: number; active: boolean | null; logLength: number; ctx: AudioContext }[] } & Omit<AudioRec, "contexts"> }).__judgeAudio;
    return {
      contexts: r.contexts.map((c) => ({ t: c.t, active: c.active, logLength: c.logLength, state: c.ctx.state })),
      starts: [...r.starts],
      resumes: r.resumes,
      decode: r.decode,
      mediaPlay: r.mediaPlay,
      ready: [...r.ready],
      states: [...r.states],
    };
  });
}

/** Records, when the bench logs `ready` (stage), the state of the last context created (C44 b: running at ready). */
async function hookReady(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as ConformanceWindow & { __judgeAudio: { contexts: { ctx: AudioContext }[]; ready: { t: number; state: string | null }[] } };
    const log = w.__conformance.log as LogEntry[] & { __judgeReadyHooked?: boolean };
    if (log.__judgeReadyHooked) return;
    const push = log.push.bind(log);
    log.push = (...entries: LogEntry[]) => {
      for (const e of entries)
        if (e.event === "ready" && e.source !== "raw") {
          const last = w.__judgeAudio.contexts[w.__judgeAudio.contexts.length - 1];
          w.__judgeAudio.ready.push({ t: performance.now(), state: last ? last.ctx.state : null });
        }
      return push(...entries);
    };
    log.__judgeReadyHooked = true;
  });
}

/**
 * Polls the contexts' state in the page every 10 ms for up to `timeout` ms. "suspended" / "running": every open
 * (not closed) context in that state, at least one open; "closed": every context created closed, at least one.
 */
function waitAudioState(page: Page, want: "suspended" | "running" | "closed", timeout = WITHIN_MS) {
  return page.evaluate(
    async ([w, limit]) => {
      const rec = (window as unknown as { __judgeAudio: { contexts: { ctx: AudioContext }[] } }).__judgeAudio;
      const states = () => rec.contexts.map((c) => c.ctx.state as string);
      const ok = () => {
        const s = states();
        if (!s.length) return false;
        if (w === "closed") return s.every((x) => x === "closed");
        const open = s.filter((x) => x !== "closed");
        return open.length > 0 && open.every((x) => x === w);
      };
      const t0 = performance.now();
      while (performance.now() - t0 <= limit) {
        if (ok()) return { ok: true, ms: Math.round(performance.now() - t0), states: states() };
        await new Promise((r) => setTimeout(r, 10));
      }
      return { ok: ok(), ms: Math.round(performance.now() - t0), states: states() };
    },
    [want, timeout] as const,
  );
}

async function expectAudioState(page: Page, want: "suspended" | "running" | "closed", where: string, timeout = WITHIN_MS) {
  const r = await waitAudioState(page, want, timeout);
  expect.soft(r.ok, `${where}: contextos en "${want}" en ≤ ${timeout} ms (estados ${JSON.stringify(r.states)}, ${r.ms} ms)`).toBe(true);
}

/** The game's declaration (meta.sounds), checked against the copy in variants.ts. */
async function soundsOf(variant: Variant) {
  const declared = (await loadMeta(variant)).sounds === true;
  expect(declared, "[control] meta.sounds coincide con variants.ts").toBe(variant.sounds === true);
  return declared;
}

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

/** Plays the run game at the bot scale (collect everything) until the review is on screen. */
async function toReview(page: Page) {
  const answers = await captureAnswers(page);
  const from = await logLength(page);
  await steerRun(page, "keyboard", "all");
  await waitForLogEvent(page, "run-end", from, 60_000);
  await waitForState(page, "review", 10_000);
  return answers;
}

function centerRoot(page: Page) {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r) window.scrollTo({ top: window.scrollY + r.top + Math.min(r.height, window.innerHeight) / 2 - window.innerHeight / 2, behavior: "instant" });
  }, GAME_ROOT);
}

// ---------- C44 ----------

test("C44(a) · cargar y scrollear hasta la precarga del módulo: 0 AudioContext y 0 resume en 2 s", async ({ page, variant }) => {
  test.skip(!variant.sounds, "juegos con meta.sounds");
  test.setTimeout(120_000);
  await soundsOf(variant);
  await page.addInitScript(instrumentAudio);
  const js = watchJsBodies(page);
  await gotoBench(page, variant.id, fastParams(variant));
  js.phase = "scroll";
  // The game root (not the stage, which a wrapper may hide in intro) into the viewport: inside the 600 px preload.
  await centerRoot(page);
  // [control] the game module was really preloaded (a JS body with Phaser after scrolling), else 0 proves nothing.
  const deadline = Date.now() + 30_000;
  let preloaded = false;
  while (!preloaded && Date.now() < deadline) {
    preloaded = (await js.settle("scroll")).some((b) => b.hasPhaser);
    if (!preloaded) await page.waitForTimeout(250);
  }
  expect(preloaded, "[control] después del scroll no se pidió el chunk con Phaser (la precarga no ocurrió)").toBe(true);
  await page.waitForTimeout(2_000);
  const rec = await readAudio(page);
  expect.soft(rec.contexts.length, "AudioContext creados antes de Empezar").toBe(0);
  expect.soft(rec.resumes, "resume() antes de Empezar").toBe(0);
});

test('C44(b) · un AudioContext por clic en "Empezar" y en "Jugar de nuevo", creado con activación del usuario y en running al llegar a ready', async ({ page, variant }) => {
  test.skip(!variant.sounds, "juegos con meta.sounds");
  test.setTimeout(240_000);
  await soundsOf(variant);
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, fastParams(variant));
  await waitForState(page, "intro");
  await hookReady(page);
  let from = await logLength(page);
  await startButton(page).click();
  await waitForLogEvent(page, "ready", from, 60_000);
  let rec = await readAudio(page);
  expect.soft(rec.contexts.length, 'contextos creados por el clic en "Empezar"').toBe(1);
  expect.soft(rec.contexts[0]?.active, "navigator.userActivation.isActive al crear el contexto").toBe(true);
  expect.soft(rec.ready[0]?.state, "estado del contexto al llegar a ready").toBe("running");

  await finishGame(page, variant);
  await waitForState(page, "result");
  from = await logLength(page);
  await page.getByRole("button", { name: "Jugar de nuevo", exact: true }).click();
  await waitForLogEvent(page, "ready", from, 60_000);
  rec = await readAudio(page);
  expect.soft(rec.contexts.length, 'contextos creados en total, después del clic en "Jugar de nuevo"').toBe(2);
  expect.soft(rec.contexts[1]?.active, 'navigator.userActivation.isActive al crear el contexto de "Jugar de nuevo"').toBe(true);
  expect.soft(rec.ready[1]?.state, 'estado del contexto al llegar a ready después de "Jugar de nuevo"').toBe("running");
});

test("C44(c) · juego sin meta.sounds: 0 AudioContext en una partida completa", async ({ page, variant }) => {
  test.skip(!!variant.sounds, "juegos sin meta.sounds");
  test.setTimeout(240_000);
  await soundsOf(variant);
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, variant.run ? botParams(variant) : fastParams(variant));
  await startGame(page);
  await finishGame(page, variant, variant.run ? { steer: "all" } : {});
  await waitForState(page, "result");
  await page.waitForTimeout(500);
  expect.soft((await readAudio(page)).contexts.length, "AudioContext creados").toBe(0);
});

// ---------- C45 ----------

test("C45(a) · pause() deja los contextos en suspended en ≤ 500 ms y resume() los vuelve a running en ≤ 500 ms", async ({ page, variant }) => {
  test.skip(!variant.sounds, "juegos con meta.sounds");
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, realParams());
  await startGame(page);
  await centerStage(page);
  await expectAudioState(page, "running", "[control] en playing, antes de pausar");
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.handle()?.pause());
  await expectAudioState(page, "suspended", "después de pause()");
  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.handle()?.resume());
  await expectAudioState(page, "running", "después de resume()");
});

for (const phase of ["playing", "review"] as const)
  for (const how of ["fuera de pantalla", "pestaña oculta"] as const)
    test(`C45(${how === "fuera de pantalla" ? "b" : "c"}) · ${how}, en ${phase}: suspended en ≤ 500 ms y running en ≤ 500 ms al volver`, async ({ page, variant }) => {
      test.skip(!variant.sounds, "juegos con meta.sounds");
      test.setTimeout(240_000);
      await page.addInitScript(instrumentAudio);
      await gotoBench(page, variant.id, phase === "playing" ? realParams() : botParams(variant));
      await startGame(page);
      if (phase === "review") await toReview(page);
      await centerRoot(page);
      await page.waitForTimeout(300);
      await expectAudioState(page, "running", `[control] en ${phase}, antes de ${how}`);
      if (how === "fuera de pantalla") {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        const off = await page.evaluate((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return !!r && (r.top >= window.innerHeight || r.bottom <= 0);
        }, GAME_ROOT);
        expect(off, "[control] el juego quedó fuera del viewport").toBe(true);
        await expectAudioState(page, "suspended", `${phase}, fuera de pantalla`);
        await centerRoot(page);
        await expectAudioState(page, "running", `${phase}, de vuelta en pantalla`);
      } else {
        await setHidden(page, true);
        await expectAudioState(page, "suspended", `${phase}, pestaña oculta`);
        await setHidden(page, false);
        await expectAudioState(page, "running", `${phase}, pestaña visible de nuevo`);
      }
    });

// ---------- C46 ----------

test('C46 · el contexto queda closed en ≤ 500 ms al llegar a result, al desmontar en playing y el anterior al tocar "Jugar de nuevo"', async ({ page, variant }) => {
  test.skip(!variant.sounds, "juegos con meta.sounds");
  test.setTimeout(240_000);
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, fastParams(variant));
  await startGame(page);
  await finishGame(page, variant);
  await waitForState(page, "result");
  await expectAudioState(page, "closed", "al llegar a result");

  const from = await logLength(page);
  await page.getByRole("button", { name: "Jugar de nuevo", exact: true }).click();
  await waitForLogEvent(page, "ready", from, 60_000);
  const rec = await readAudio(page);
  expect.soft(rec.contexts.length, '[control] "Jugar de nuevo" creó un contexto nuevo').toBe(2);
  expect.soft(rec.contexts[0]?.state, 'contexto anterior después de "Jugar de nuevo"').toBe("closed");

  await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.setMounted(false));
  await expectAudioState(page, "closed", "setMounted(false) en playing");
});

test("C46 · 20 ciclos de Empezar y desmontar alternando los cinco juegos: 0 contextos abiertos y ningún mensaje de AudioContext", async ({ page, variant }) => {
  test.skip(!variant.sounds, "corre desde el proyecto del juego con sonido");
  test.setTimeout(240_000);
  const c = watchConsole(page, variant.assetBase);
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, DUMMY_VARIANT.id, realParams());
  let withSound = 0;
  for (let i = 0; i < 20; i++) {
    const v = ALL_VARIANTS[i % ALL_VARIANTS.length];
    if (v.sounds) withSound++;
    await test.step(`ciclo ${i + 1} (${v.id})`, async () => {
      await page.evaluate((id) => {
        const conf = (window as unknown as ConformanceWindow).__conformance;
        conf.setGameId(id);
        conf.setMounted(true);
      }, v.id);
      await waitForState(page, "intro");
      const from = await logLength(page);
      await startButton(page).click();
      await waitForLogEvent(page, "ready", from, i < ALL_VARIANTS.length ? 60_000 : 15_000);
      await page.evaluate(() => (window as unknown as ConformanceWindow).__conformance.setMounted(false));
    });
  }
  await page.waitForTimeout(WITHIN_MS);
  const rec = await readAudio(page);
  expect(rec.contexts.length, `[control] un contexto por ciclo del juego con sonido (${withSound})`).toBe(withSound);
  expect.soft(rec.contexts.filter((x) => x.state !== "closed").map((x) => x.state), "contextos abiertos después de los 20 ciclos").toEqual([]);
  const audioMessages = c.messages.filter((m) => (m.type === "warning" || m.type === "error") && /AudioContext/i.test(m.text)).map((m) => `${m.type}: ${m.text}`);
  expect.soft(audioMessages, "warning/error de consola con AudioContext").toEqual([]);
});

// ---------- C47 ----------

const STATES = ["intro", "loading", "playing", "review", "result"];

test("C47(a) · botón de silencio: button, aria-pressed=\"false\" al cargar, visible en intro, loading, playing, review y result (juegos con sonido); ausente en los juegos sin sonido", async ({ page, variant }) => {
  test.setTimeout(240_000);
  const sounds = await soundsOf(variant);
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, variant.run ? botParams(variant) : fastParams(variant));
  await waitForState(page, "intro");
  if (sounds) {
    const mute = page.locator(MUTE);
    await expect.soft(mute, 'data-testid="mute" visible en intro').toBeVisible();
    expect.soft(await mute.evaluate((el) => el.tagName === "BUTTON" || el.getAttribute("role") === "button"), "mute es un botón").toBe(true);
    expect.soft(await mute.getAttribute("aria-pressed"), 'aria-pressed al cargar').toBe("false");
    if (MUTE_NAME) await expect.soft(page.getByRole("button", { name: MUTE_NAME, exact: true }), `nombre accesible "${MUTE_NAME}"`).toHaveAttribute("data-testid", "mute");
    else test.info().annotations.push({ type: "info", description: "nombre accesible del botón: sin confirmar por el usuario, no se verificó" });
  }
  await startGame(page);
  await finishGame(page, variant, variant.run ? { steer: "all" } : {});
  await waitForState(page, "result");
  await page.waitForTimeout(300);
  const rec = await readAudio(page);
  test.info().annotations.push({ type: "info", description: `estados vistos: ${JSON.stringify(rec.states)}` });
  if (sounds) {
    for (const s of STATES) {
      const seen = rec.states.filter((x) => x.state === s);
      expect(seen.length, `[control] el wrapper pasó por ${s}`).toBeGreaterThan(0);
      expect.soft(seen.every((x) => x.muteVisible), `mute visible en ${s}`).toBe(true);
    }
  } else expect.soft(rec.states.filter((x) => x.mutePresent).map((x) => x.state), 'estados con data-testid="mute" en un juego sin sonido').toEqual([]);
});

test("C47(b) · alternar el silencio cambia aria-pressed, registra mute, no remonta el canvas ni emite ready", async ({ page, variant }) => {
  test.skip(!variant.sounds, "juegos con meta.sounds");
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, realParams());
  await startGame(page);
  await centerStage(page);
  await page.evaluate((sel) => {
    (window as unknown as { __judgeCanvas: Element | null }).__judgeCanvas = document.querySelector(sel)?.querySelector("canvas") ?? null;
  }, STAGE);
  const from = await logLength(page);
  const mute = page.locator(MUTE);
  await mute.click();
  await expect.soft(mute, "aria-pressed después del primer clic").toHaveAttribute("aria-pressed", "true");
  await mute.click();
  await expect.soft(mute, "aria-pressed después del segundo clic").toHaveAttribute("aria-pressed", "false");
  if (MUTE_NAME) await expect.soft(page.getByRole("button", { name: MUTE_NAME, exact: true }), "el nombre no cambia al alternar").toHaveAttribute("data-testid", "mute");
  await page.waitForTimeout(300);
  const log = (await readLog(page)).slice(from);
  expect.soft(log.filter((e) => e.event === "mute").map((e) => e.payload), "eventos mute").toEqual([{ muted: true }, { muted: false }]);
  expect.soft(log.filter((e) => e.event === "ready").length, "ready después de alternar").toBe(0);
  const same = await page.evaluate((sel) => {
    const saved = (window as unknown as { __judgeCanvas: Element | null }).__judgeCanvas;
    return !!saved && saved.isConnected && document.querySelector(sel)?.querySelector("canvas") === saved;
  }, STAGE);
  expect.soft(same, "mismo canvas, sigue en el DOM").toBe(true);
});

test("C47(c) · con silencio activado desde la intro, una partida completa no emite ningún start()", async ({ page, variant }) => {
  test.skip(!variant.sounds, "juegos con meta.sounds");
  test.setTimeout(240_000);
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, botParams(variant));
  await waitForState(page, "intro");
  await page.locator(MUTE).click();
  await expect(page.locator(MUTE), "[control] silencio activado").toHaveAttribute("aria-pressed", "true");
  const from = await logLength(page);
  await startGame(page);
  await finishGame(page, variant, { steer: "all" });
  await waitForState(page, "result");
  await page.waitForTimeout(500);
  const log = (await readLog(page)).slice(from);
  const collects = log.filter((e) => e.event === "collect" && (e.payload as { collected: number }).collected > 0).length;
  const answers = log.filter((e) => e.event === "answer").length;
  expect(collects, "[control] hubo recolecciones").toBeGreaterThan(0);
  expect(answers, "[control] hubo respuestas").toBeGreaterThan(0);
  expect.soft((await readAudio(page)).starts.length, "start() con silencio activado").toBe(0);
});

for (const reducedMotion of [false, true])
  test(`C47(d) · [control] sin silencio${reducedMotion ? ", con reducedMotion" : ""}: ≥ 1 start() en 300 ms tras cada collect y cada answer; total ≥ recolecciones + choques + respuestas`, async ({ page, variant }) => {
    test.skip(!variant.sounds, "juegos con meta.sounds");
    test.setTimeout(240_000);
    await page.addInitScript(instrumentAudio);
    await gotoBench(page, variant.id, botParams(variant, { reducedMotion }));
    await waitForState(page, "intro");
    await hookRunEndSnapshot(page);
    const from = await logLength(page);
    await startGame(page);
    await finishGame(page, variant, { steer: "all" });
    await waitForState(page, "result");
    await page.waitForTimeout(500);
    const log = (await readLog(page)).slice(from);
    const rec = await readAudio(page);
    const motion = await motionAtEnd(page);
    expect(motion, "[control] debugMotion() en el instante de run-end").not.toBeNull();
    const events = log.filter((e) => (e.event === "collect" && (e.payload as { collected: number }).collected > 0) || e.event === "answer");
    // The bench writes the log entry when the wrapper receives the callback, which can come right after the game or
    // the review started the sound in the same handler (measured in the verdict of 15/10/2026: start() 1 ms before the
    // answer entry). Same-handler starts count: window [t − SAME_HANDLER_MS, t + 300].
    const silent = events
      .filter((e) => !rec.starts.some((t) => t >= e.t - SAME_HANDLER_MS && t <= e.t + 300))
      .map((e) => `${e.event} ${JSON.stringify(e.payload)} a los ${Math.round(e.t)} ms (start() cercanos: ${JSON.stringify(rec.starts.filter((t) => Math.abs(t - e.t) <= 500).map((t) => Math.round(t - e.t)))})`);
    const collects = events.filter((e) => e.event === "collect").length;
    const answers = events.filter((e) => e.event === "answer").length;
    const collisions = motion?.collisions.length ?? 0;
    test.info().annotations.push({ type: "info", description: `start(): ${rec.starts.length}; recolecciones ${collects}, choques ${collisions}, respuestas ${answers}` });
    expect(collects + answers, "[control] hubo recolecciones y respuestas").toBeGreaterThan(1);
    expect.soft(silent, "collect / answer sin ningún start() en los 300 ms siguientes").toEqual([]);
    expect.soft(rec.starts.length, "start() en total ≥ recolecciones + choques + respuestas").toBeGreaterThanOrEqual(collects + collisions + answers);
  });

// ---------- C48 (b) ----------

test("C48(b) · partida completa: 0 pedidos de audio, 0 decodeAudioData y 0 HTMLMediaElement.play", async ({ page, variant }) => {
  test.skip(!variant.sounds, "juegos con meta.sounds");
  test.setTimeout(240_000);
  const audioRequests: string[] = [];
  page.on("request", (req) => {
    if (/\.(mp3|ogg|wav|m4a|aac)(\?|#|$)/i.test(new URL(req.url()).pathname) || req.resourceType() === "media") audioRequests.push(req.url());
  });
  page.on("response", (res) => {
    if ((res.headers()["content-type"] ?? "").startsWith("audio/")) audioRequests.push(`${res.url()} (${res.headers()["content-type"]})`);
  });
  await page.addInitScript(instrumentAudio);
  await gotoBench(page, variant.id, botParams(variant));
  await startGame(page);
  await finishGame(page, variant, { steer: "all" });
  await waitForState(page, "result");
  await page.waitForTimeout(500);
  const rec = await readAudio(page);
  expect.soft(audioRequests, "pedidos de audio").toEqual([]);
  expect.soft(rec.decode, "decodeAudioData").toBe(0);
  expect.soft(rec.mediaPlay, "HTMLMediaElement.play").toBe(0);
});

// ---------- C49 ----------

test('C49 · con los archivos servidos, cada grupo de la revisión muestra un review-sprite visible con src terminado en assetBase + "trash-<tipo>.webp"', async ({ page, variant }) => {
  test.skip(!variant.sounds, "juego con sprites en la revisión (clean-channels)");
  test.setTimeout(240_000);
  const manifest = readManifest(variant.dir);
  await serveAssets(page, allPresent(manifest), page, manifest, variant.assetBase);
  await gotoBench(page, variant.id, botParams(variant));
  await startGame(page);
  const answers = await toReview(page);
  const seen: string[] = [];
  await answerReview(page, answers, "keyboard", () => true, async (id) => {
    seen.push(id);
    const sprites = page.locator(REVIEW).locator(SPRITE);
    await expect.soft(sprites.first(), `grupo ${id}: review-sprite visible`).toBeVisible({ timeout: 2_000 });
    const srcs = await sprites.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    expect.soft(srcs.length, `grupo ${id}: cantidad de review-sprite`).toBeGreaterThan(0);
    for (const src of srcs) expect.soft(new URL(src).pathname, `grupo ${id}: src del review-sprite`).toBe(`${variant.assetBase}trash-${id}.webp`);
  });
  expect(seen.length, "[control] la revisión tuvo grupos").toBeGreaterThan(0);
  await waitForState(page, "result", 10_000);
});

test("C49 · con el sprite de un tipo en 404: ese grupo sin img, con el nombre visible, y la clasificación se completa", async ({ page, variant }) => {
  test.skip(!variant.sounds, "juego con sprites en la revisión (clean-channels)");
  test.setTimeout(240_000);
  const missingType = "pet-bottle";
  const { WASTE } = importModule<{ WASTE?: Record<string, { name: string }> }>(`${variant.dir}/meta.ts`);
  const name = WASTE?.[missingType]?.name ?? "";
  expect(name, `[control] meta.ts tiene el nombre de ${missingType}`).not.toBe("");
  const manifest = readManifest(variant.dir);
  await serveAssets(page, { ...allPresent(manifest), [`trash-${missingType}.webp`]: "404" }, page, manifest, variant.assetBase);
  await gotoBench(page, variant.id, botParams(variant, { difficulty: "fast" }));
  await startGame(page);
  const answers = await toReview(page);
  let met = false;
  await answerReview(page, answers, "keyboard", () => true, async (id) => {
    if (id !== missingType) return;
    met = true;
    const sprites = page.locator(REVIEW).locator(SPRITE);
    await expect.soft(sprites, `grupo ${id} con su archivo en 404: sin review-sprite`).toHaveCount(0, { timeout: 2_000 });
    await expect.soft(page.locator(REVIEW).getByText(name, { exact: false }).first(), `grupo ${id}: nombre "${name}" visible`).toBeVisible();
  });
  expect(met, `[control] la revisión tuvo el grupo ${missingType}`).toBe(true);
  await waitForState(page, "result", 10_000);
  expect.soft((await readLog(page)).some((e) => e.event === "complete"), "la clasificación se completó (complete)").toBe(true);
});
