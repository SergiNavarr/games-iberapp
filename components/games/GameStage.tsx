"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";
import { GAMES } from "@/lib/data/games";
import { getPortal } from "@/lib/data/portals";
import {
  gameResultSchema,
  maxTotal,
  TOKEN_NAMES,
  type GameHandle,
  type GameModule,
  type GameResult,
  type GameTokens,
  type ProgressEntry,
  type ReadyEntry,
  type RegistryEntry,
  type ReviewModule,
  type ReviewProps,
  type TokenName,
} from "@/lib/games/contract";
import { REGISTRY } from "@/lib/games/registry";
import { saveBestResult } from "@/lib/storage/game-progress";
import type { GameId } from "@/types/portal";

// The only wrapper for every minigame (plan §2.2, E1). The canvas draws only the playable action; everything else
// (header, instructions, difficulty, markers, loading, review, error, result, aria-live, "Próximamente") is DOM here,
// with the landing's fonts and tokens. Phaser stays out of the initial bundle: the game module is preloaded with
// import() when the stage is 600 px from the viewport and mounted only on "Empezar".
//
// Run games (entry.review): the canvas plays the run and reports onCollect / onRunEnd. On onRunEnd the wrapper
// destroys the canvas (no WebGL context during review and result) and mounts the game's review component, which
// reports each answer and the final result; the wrapper announces, scores, validates and saves.

export type GameStageState = "coming-soon" | "intro" | "loading" | "playing" | "review" | "result" | "error";

export type GameStageEvent =
  | { event: "state"; payload: GameStageState }
  | { event: "ready"; payload: null }
  | { event: "progress"; payload: { hits: number; total: number } }
  | { event: "collect"; payload: { collected: number; inChannel: number } }
  | { event: "announce"; payload: string }
  | { event: "run-end"; payload: unknown }
  | { event: "answer"; payload: { hit: boolean; hits: number; total: number } }
  | { event: "complete"; payload: GameResult }
  | { event: "error"; payload: string }
  | { event: "report"; payload: null }
  | { event: "destroyed"; payload: null }
  | { event: "persisted"; payload: ProgressEntry };

/** Test benches only; the landing never passes it. */
export interface GameStageDevOptions {
  /** Mounts a game that is not a GameId (the harness dummies): its id keys the progress, its title the header. */
  entryOverride?: { id: string; title: string; entry: ReadyEntry };
  seed?: number;
  testHooks?: boolean;
  /** Overrides prefers-reduced-motion. */
  reducedMotion?: boolean;
  /** Preselected option of the intro's difficulty selector (ignored if the game has no such id). */
  difficulty?: string;
  /** Game time scale; only sent to the game with testHooks. */
  timeScale?: number;
  onHandle?: (handle: GameHandle | null) => void;
  onEvent?: (event: GameStageEvent) => void;
}

interface GameStageProps {
  gameId: GameId;
  /** Display only (P4): the portal shown in the header. */
  portalId: string;
  /** "Reportar" on the result screen: the landing scrolls to its report section. */
  onReport: () => void;
  devOptions?: GameStageDevOptions;
}

const TOKEN_VARS: Record<TokenName, string> = {
  bg2: "--bg2",
  fg: "--fg",
  head: "--head",
  mute: "--mute",
  rule: "--rule",
  mint: "--color-mint",
  leaf: "--color-leaf",
  yellow: "--color-yellow",
  orange: "--color-orange",
  sky: "--color-sky",
};

/** Landing tokens as CSS color strings (globals.css is the only source): the canvas cannot read CSS. */
export function readGameTokens(): GameTokens {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKEN_NAMES.map((name) => [name, css.getPropertyValue(TOKEN_VARS[name]).trim()])) as GameTokens;
}

const assetBaseFor = (id: string) => `/games/${id}/`;
const OFFSCREEN_SETTLE_MS = 150;
const EMPTY_TITLE = "Esta vez no hubo nada para contar";
const EMPTY_TEXT = "Probá de nuevo: cada partida es distinta.";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (cb: () => void) => {
  const media = matchMedia(reducedMotionQuery);
  media.addEventListener("change", cb);
  return () => media.removeEventListener("change", cb);
};
const usePrefersReducedMotion = () =>
  useSyncExternalStore(subscribeReducedMotion, () => matchMedia(reducedMotionQuery).matches, () => false);

export function GameStage({ gameId, portalId, onReport, devOptions }: GameStageProps) {
  const override = devOptions?.entryOverride;
  const id = override?.id ?? gameId;
  const entry: RegistryEntry = override?.entry ?? REGISTRY[gameId];
  const title = override?.title ?? GAMES.find((g) => g.id === gameId)?.title ?? gameId;
  // A new game id is a new component: the previous game is destroyed (cleanup) before the next one can mount, and the
  // change fades in the DOM, never with two Phaser games alive.
  return <GameStageView key={id} id={id} entry={entry} title={title} portal={getPortal(portalId)?.name} onReport={onReport} devOptions={devOptions} />;
}

interface ViewProps {
  id: string;
  entry: RegistryEntry;
  title: string;
  portal: string | undefined;
  onReport: () => void;
  devOptions?: GameStageDevOptions;
}

interface ReviewView {
  Review: ComponentType<ReviewProps>;
  summary: unknown;
  difficulty: string | undefined;
}

function initialDifficulty(entry: ReadyEntry | null, preferred: string | undefined) {
  const options = entry?.meta.difficulties;
  if (!options?.length) return undefined;
  if (preferred && options.some((d) => d.id === preferred)) return preferred;
  return entry?.meta.defaultDifficulty ?? options[0].id;
}

function GameStageView({ id, entry, title, portal, onReport, devOptions }: ViewProps) {
  const ready = entry.status === "ready" ? entry : null;
  const meta = ready?.meta;
  const isRunGame = !!ready?.review;
  const [state, setState] = useState<GameStageState>(ready ? "intro" : "coming-soon");
  const [run, setRun] = useState(0);
  const [difficulty, setDifficulty] = useState(() => initialDifficulty(ready, devOptions?.difficulty));
  const [hits, setHits] = useState(0);
  const [denominator, setDenominator] = useState(() => (meta ? maxTotal(meta, initialDifficulty(ready, devOptions?.difficulty)) : 0));
  const [collect, setCollect] = useState({ collected: 0, inChannel: 0 });
  const [review, setReview] = useState<ReviewView | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [live, setLive] = useState({ text: "", n: 0 });
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const resultTitleRef = useRef<HTMLHeadingElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const moduleRef = useRef<Promise<GameModule> | null>(null);
  const reviewModuleRef = useRef<Promise<ReviewModule> | null>(null);
  const pauseRef = useRef({ offscreen: false, hidden: false, result: false });
  const autoPaused = useRef(false);
  // The play in progress: difficulty played, collected count (the review's denominator) and the review's tally.
  const playRef = useRef({ token: 0, difficulty: undefined as string | undefined, collected: 0, answered: 0, hits: 0, done: false });
  const { theme } = useTheme();
  const systemReducedMotion = usePrefersReducedMotion();

  // Latest values for callbacks and the mount effect, without remounting the game when they change.
  const latest = useRef({ devOptions, onReport, theme, reducedMotion: devOptions?.reducedMotion ?? systemReducedMotion });
  useEffect(() => {
    latest.current = { devOptions, onReport, theme, reducedMotion: devOptions?.reducedMotion ?? systemReducedMotion };
  });

  const emit = useCallback((event: GameStageEvent) => latest.current.devOptions?.onEvent?.(event), []);
  const go = useCallback(
    (next: GameStageState) => {
      setState(next);
      emit({ event: "state", payload: next });
    },
    [emit],
  );
  const say = useCallback(
    (text: string) => {
      setLive((prev) => ({ text, n: prev.n + 1 }));
      emit({ event: "announce", payload: text });
    },
    [emit],
  );
  const fail = useCallback(
    (error: unknown) => {
      emit({ event: "error", payload: error instanceof Error ? error.message : String(error) });
      go("error");
    },
    [emit, go],
  );

  /** The final result, from the game (onComplete) or from the review (onDone): validate, show, save. */
  const finish = useCallback(
    (payload: GameResult) => {
      if (!meta) return;
      const parsed = gameResultSchema.safeParse(payload);
      if (!parsed.success || parsed.data.total > maxTotal(meta, playRef.current.difficulty)) return fail(new Error("Resultado inválido"));
      setHits(parsed.data.hits);
      setDenominator(parsed.data.total);
      setResult(parsed.data);
      emit({ event: "complete", payload: parsed.data });
      go("result");
      emit({ event: "persisted", payload: saveBestResult(id, parsed.data) });
    },
    [meta, id, emit, go, fail],
  );

  // Only on transitions, and only resuming what the wrapper itself paused: a repeated observer entry must not undo
  // a pause somebody else asked for through the handle.
  const applyPause = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const { offscreen, hidden, result: atResult } = pauseRef.current;
    const shouldPause = offscreen || hidden || atResult;
    if (shouldPause && !autoPaused.current) {
      autoPaused.current = true;
      handle.pause();
    } else if (!shouldPause && autoPaused.current) {
      autoPaused.current = false;
      handle.resume();
    }
  }, []);

  const load = useCallback(() => {
    if (!ready) return null;
    if (!moduleRef.current) {
      const promise = ready.load();
      promise.catch(() => {
        if (moduleRef.current === promise) moduleRef.current = null; // "Reintentar" tries again
      });
      moduleRef.current = promise;
    }
    return moduleRef.current;
  }, [ready]);

  const loadReview = useCallback(() => {
    if (!ready?.review) return null;
    if (!reviewModuleRef.current) {
      const promise = ready.review();
      promise.catch(() => {
        if (reviewModuleRef.current === promise) reviewModuleRef.current = null;
      });
      reviewModuleRef.current = promise;
    }
    return reviewModuleRef.current;
  }, [ready]);

  /** onRunEnd: the canvas is already gone; mount the game's review component with the run summary. */
  const startReview = useCallback(
    (summary: unknown) => {
      const play = playRef.current;
      const token = play.token;
      const promise = loadReview();
      if (!promise) return fail(new Error("El juego terminó un recorrido pero no tiene revisión"));
      Object.assign(play, { answered: 0, hits: 0, done: false });
      setHits(0);
      setDenominator(play.collected);
      go("review");
      promise.then(
        ({ Review }) => {
          if (playRef.current.token === token) setReview({ Review, summary, difficulty: play.difficulty });
        },
        (error) => {
          if (playRef.current.token === token) fail(error);
        },
      );
    },
    [loadReview, go, fail],
  );

  const onAnswer = useCallback(
    ({ hit, announcement }: { hit: boolean; announcement: string }) => {
      const play = playRef.current;
      if (play.done) return;
      play.answered += 1;
      if (hit) play.hits += 1;
      emit({ event: "answer", payload: { hit, hits: play.hits, total: play.collected } });
      if (hit) {
        setHits(play.hits);
        emit({ event: "progress", payload: { hits: play.hits, total: play.collected } });
      }
      say(announcement);
    },
    [emit, say],
  );

  const onDone = useCallback(
    (payload: GameResult) => {
      const play = playRef.current;
      if (play.done) return;
      play.done = true;
      finish(payload);
    },
    [finish],
  );

  // Preload the module (and Phaser) 600 px before the stage enters the viewport, like the landing's MapView.
  useEffect(() => {
    const root = rootRef.current;
    if (!ready || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          load();
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [ready, load]);

  // One game per run ("Empezar", "Jugar de nuevo", "Reintentar"). The flag covers Strict Mode's mount → unmount →
  // mount: the first import() resolves after its cleanup and never mounts.
  useEffect(() => {
    const stage = stageRef.current;
    const promise = run > 0 ? load() : null;
    if (!stage || !promise || !ready) return;
    let disposed = false;
    let released = false;
    let handle: GameHandle | null = null;
    const { devOptions: dev, theme: initialTheme, reducedMotion } = latest.current;
    const play = playRef.current;
    const release = () => {
      if (!handle || released) return;
      released = true;
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = null;
      latest.current.devOptions?.onHandle?.(null);
      emit({ event: "destroyed", payload: null });
    };

    promise.then((gameModule) => {
      if (disposed) return;
      try {
        handle = gameModule.mountGame(stage, {
          assetBase: assetBaseFor(id),
          theme: initialTheme,
          tokens: readGameTokens(),
          reducedMotion,
          seed: dev?.seed,
          testHooks: dev?.testHooks,
          difficulty: play.difficulty,
          timeScale: dev?.testHooks ? dev.timeScale : undefined,
          onReady: () => {
            if (disposed) return;
            emit({ event: "ready", payload: null });
            go("playing");
          },
          onProgress: (progress) => {
            if (disposed) return;
            setHits(progress.hits);
            setDenominator(progress.total);
            emit({ event: "progress", payload: progress });
          },
          onCollect: (progress) => {
            if (disposed) return;
            play.collected = progress.collected;
            setCollect(progress);
            emit({ event: "collect", payload: progress });
          },
          announce: (text) => {
            if (!disposed) say(text);
          },
          onComplete: (payload) => {
            if (!disposed) finish(payload);
          },
          onRunEnd: (summary) => {
            if (disposed) return;
            emit({ event: "run-end", payload: summary });
            release(); // no canvas and no WebGL context during review and result
            startReview(summary);
          },
          onError: (error) => {
            if (!disposed) fail(error);
          },
        });
      } catch (error) {
        return fail(error);
      }
      handleRef.current = handle;
      autoPaused.current = false;
      latest.current.devOptions?.onHandle?.(handle);
      applyPause();
    }, (error) => {
      if (!disposed) fail(error);
    });

    return () => {
      disposed = true;
      release();
    };
  }, [run, id, ready, load, emit, go, say, fail, finish, startReview, applyPause]);

  // Pause off-screen, with the tab hidden and on the result screen (no requestAnimationFrame while paused).
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    // A visibility change counts once it lasts OFFSCREEN_SETTLE_MS: transient entries (a full-page screenshot briefly
    // resizes the viewport, fast scroll choreography) must not pause and resume the loop.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver((entries) => {
      const offscreen = !entries[entries.length - 1].isIntersecting;
      clearTimeout(settle);
      settle = setTimeout(() => {
        pauseRef.current.offscreen = offscreen;
        applyPause();
      }, OFFSCREEN_SETTLE_MS);
    });
    observer.observe(stage);
    const onVisibility = () => {
      pauseRef.current.hidden = document.hidden || document.visibilityState === "hidden";
      applyPause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(settle);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, applyPause]);

  useEffect(() => {
    pauseRef.current.result = state === "result";
    applyPause();
    if (state === "result") resultTitleRef.current?.focus();
    if (state === "review") reviewRef.current?.focus();
  }, [state, applyPause]);

  // Live theme: same canvas, new colors.
  useEffect(() => {
    handleRef.current?.setTheme(theme, readGameTokens());
  }, [theme]);

  const start = () => {
    if (!meta) return;
    const max = maxTotal(meta, difficulty);
    playRef.current = { token: playRef.current.token + 1, difficulty, collected: 0, answered: 0, hits: 0, done: false };
    loadReview(); // ready by the end of the run
    setHits(0);
    setDenominator(max);
    setCollect({ collected: 0, inChannel: max });
    setReview(null);
    setResult(null);
    setLive((prev) => ({ text: "", n: prev.n }));
    setRun((n) => n + 1);
    go("loading");
    stageRef.current?.focus({ preventScroll: true });
  };

  const busy = state === "loading";
  const showCollect = isRunGame && (state === "loading" || state === "playing");

  return (
    <section
      ref={rootRef}
      data-testid="game-stage"
      data-state={state}
      data-game={id}
      aria-label={title}
      className="flex w-full flex-col gap-4 text-fg transition-opacity duration-500 starting:opacity-0"
    >
      <header className="flex flex-col gap-2">
        <span className="eyebrow text-mute">{portal ? `Aprendelo jugando · ${portal}` : "Aprendelo jugando"}</span>
        <h3 className="title-display m-0 text-[clamp(30px,4vw,48px)] leading-[0.95] text-head">{title}</h3>
      </header>

      {!ready || !meta ? (
        <ComingSoon id={id} title={title} />
      ) : (
        <>
          {/* No border on the box: it would make the stage 2 px off 16:9 / 4:5 and the canvas would not fill it (Scale.FIT). */}
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[12px] bg-page-2 tab:aspect-video">
            <div
              ref={stageRef}
              data-testid="stage"
              tabIndex={state === "loading" || state === "playing" ? 0 : -1}
              aria-label={`Escenario de ${title}`}
              aria-busy={busy}
              className="absolute inset-0 select-none outline-offset-[-4px] [&>canvas]:block"
            />

            {state === "intro" && (
              <Panel>
                <div className="flex max-w-[56ch] flex-col gap-3">
                  {meta.instructions.map((p) => (
                    <p key={p} className="m-0 text-[17px] leading-snug">
                      {p}
                    </p>
                  ))}
                </div>
                <dl className="m-0 grid gap-2 text-[15px] leading-snug text-mute">
                  <div>
                    <dt className="eyebrow inline text-fg">Tocando · </dt>
                    <dd className="m-0 inline">{meta.controls.pointer}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow inline text-fg">Teclado · </dt>
                    <dd className="m-0 inline">{meta.controls.keyboard}</dd>
                  </div>
                </dl>
                {meta.difficulties && meta.difficulties.length > 0 && (
                  <div role="radiogroup" aria-label="Dificultad" data-testid="difficulty" className="flex flex-wrap items-center gap-2">
                    <span className="eyebrow mr-1 text-mute">Dificultad</span>
                    {meta.difficulties.map((d) => (
                      <label
                        key={d.id}
                        className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-rule px-3 text-[15px] has-[:checked]:border-transparent has-[:checked]:bg-btn has-[:checked]:text-btn-fg"
                      >
                        <input
                          type="radio"
                          name={`difficulty-${id}`}
                          value={d.id}
                          data-testid={`difficulty-${d.id}`}
                          checked={difficulty === d.id}
                          onChange={() => {
                            setDifficulty(d.id);
                            setDenominator(maxTotal(meta, d.id));
                          }}
                          className="m-0 accent-mint"
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                )}
                <StageButton onClick={start} primary>
                  Empezar
                </StageButton>
              </Panel>
            )}

            {busy && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="eyebrow animate-ib-breathe text-mute">Cargando…</span>
              </div>
            )}

            {state === "review" && (
              <div ref={reviewRef} data-testid="review" tabIndex={-1} aria-label={`Revisión de ${title}`} className="absolute inset-0 overflow-y-auto bg-page-2 p-[clamp(20px,4vw,48px)] outline-offset-[-4px]">
                {review ? (
                  <review.Review summary={review.summary} meta={meta} difficulty={review.difficulty} onAnswer={onAnswer} onDone={onDone} />
                ) : (
                  <span className="eyebrow animate-ib-breathe text-mute">Cargando…</span>
                )}
              </div>
            )}

            {state === "result" && result && (
              <Panel>
                <h4 ref={resultTitleRef} data-testid="result-title" tabIndex={-1} className="title-display m-0 text-[clamp(26px,3.4vw,40px)] leading-none text-head">
                  {result.total === 0 ? (meta.emptyResult?.title ?? EMPTY_TITLE) : result.completed ? "¡Desafío completo!" : "Fin de la partida"}
                </h4>
                {result.total === 0 ? (
                  <p data-testid="result-empty" className="m-0 max-w-[56ch] text-[17px] leading-snug">
                    {meta.emptyResult?.text ?? EMPTY_TEXT}
                  </p>
                ) : (
                  <p className="m-0 text-[17px]">
                    {result.hits} / {result.total} {meta.scoreLabel}
                  </p>
                )}
                <p data-testid="result-score" className="title-display m-0 text-[clamp(22px,2.6vw,30px)] leading-none text-head">
                  {result.score} {meta.pointsLabel ?? "puntos"}
                </p>
                <p className="m-0 max-w-[56ch] text-[17px] leading-snug text-mute">{meta.learning}</p>
                <div className="flex flex-wrap gap-3">
                  <StageButton
                    primary
                    onClick={() => {
                      emit({ event: "report", payload: null });
                      latest.current.onReport();
                    }}
                  >
                    Reportar
                  </StageButton>
                  <StageButton onClick={start}>Jugar de nuevo</StageButton>
                </div>
              </Panel>
            )}

            {state === "error" && (
              <Panel>
                <p role="alert" className="m-0 max-w-[48ch] text-[17px] leading-snug">
                  No pudimos cargar el juego. Revisá la conexión y probá de nuevo.
                </p>
                <StageButton onClick={start} primary>
                  Reintentar
                </StageButton>
              </Panel>
            )}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[12px] border border-rule" />
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            {showCollect ? (
              <p className="m-0 text-[15px] text-mute">
                <span data-testid="collect" className="font-semibold text-fg">
                  {collect.collected} / {collect.inChannel}
                </span>{" "}
                {meta.collectLabel ?? "recolectados"}
              </p>
            ) : (
              <p className="m-0 text-[15px] text-mute">
                <span data-testid="score" className="font-semibold text-fg">
                  {hits} / {denominator}
                </span>{" "}
                {meta.scoreLabel}
              </p>
            )}
            <p data-testid="live" role="status" aria-live="polite" className="m-0 min-h-[1.4em] text-[15px] text-mute">
              {live.text}
              {live.n % 2 ? " " : ""}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-start justify-center gap-5 overflow-y-auto bg-page-2/95 p-[clamp(20px,4vw,48px)]">{children}</div>
  );
}

function StageButton({ onClick, primary = false, children }: { onClick: () => void; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center rounded-[10px] px-5 text-[15px] font-medium leading-none transition-transform duration-300 hover:scale-[1.015] ${
        primary ? "border-0 bg-btn text-btn-fg" : "border border-rule bg-transparent text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** "Próximamente": a finished state, not an error or a gap. The art is drawn in code with the landing's tokens. */
function ComingSoon({ id, title }: { id: string; title: string }) {
  const description = GAMES.find((g) => g.id === id)?.description;
  return (
    <div className="relative flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-[12px] bg-forest tab:aspect-video">
      <ComingSoonArt id={id} />
      <div className="relative flex flex-col items-start gap-3 bg-gradient-to-t from-night/85 to-transparent p-[clamp(20px,4vw,48px)] pt-20 text-white">
        <span className="eyebrow rounded-[4px] bg-mint px-2 py-1 text-night">Próximamente</span>
        <p className="m-0 max-w-[52ch] text-[17px] leading-snug text-cloud">{description ?? `${title} está en preparación.`}</p>
      </div>
    </div>
  );
}

function ComingSoonArt({ id }: { id: string }) {
  const label = id === "dark-sky" ? "Ilustración: cielo estrellado sobre el estero" : id === "night-voices" ? "Ilustración: luna y ondas de sonido en el estero" : "Ilustración del estero";
  const stars = Array.from({ length: 36 }, (_, i) => ({ x: (i * 97) % 640, y: (i * 53) % 210, r: i % 5 === 0 ? 2.4 : 1.4 }));
  return (
    <svg data-testid="coming-soon-art" role="img" aria-label={label} viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <rect width="640" height="360" fill="var(--color-night)" />
      {id === "night-voices" ? (
        <>
          {/* Kept around the center: the 4:5 crop of this 16:9 drawing only shows x ≈ 176–464. */}
          <circle cx="400" cy="92" r="30" fill="var(--color-cloud)" opacity="0.9" />
          {stars.slice(0, 18).map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y * 0.6} r={s.r * 0.8} fill="var(--color-cloud)" opacity={0.35 + (i % 3) * 0.15} />
          ))}
          <circle cx="262" cy="214" r="7" fill="var(--color-mint)" />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${284 + i * 22} ${186 - i * 16} q ${20 + i * 12} ${28 + i * 16} 0 ${56 + i * 32}`} fill="none" stroke="var(--color-mint)" strokeWidth="4" strokeLinecap="round" opacity={0.9 - i * 0.22} />
          ))}
        </>
      ) : (
        stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="var(--color-cloud)" opacity={0.5 + (i % 3) * 0.2} />)
      )}
      <path d="M0 270 C 120 250 220 290 340 268 S 540 250 640 272 V 360 H 0 Z" fill="var(--color-night-2)" />
      <path d="M0 300 C 140 290 260 318 380 302 S 560 292 640 306 V 360 H 0 Z" fill="var(--color-leaf)" opacity="0.35" />
    </svg>
  );
}
