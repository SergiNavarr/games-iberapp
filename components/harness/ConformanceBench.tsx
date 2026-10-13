"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameStage, readGameTokens, type GameStageEvent } from "@/components/games/GameStage";
import { BENCH_IDS, benchStage } from "@/components/harness/bench-games";
import type { GameHandle, GameModule, GameTheme } from "@/lib/games/contract";
import { useGameProgress } from "@/lib/storage/game-progress";

// HARNESS (T4, E1, E2): conformance bench for the judge's suite (tests/conformance/contract/). Fixed interface: the route
// /conformance/[gameId] and its query (seed, testHooks, reducedMotion, difficulty, timeScale), the data-testid
// attributes, the button names (GameStage) and window.__conformance. Do not change them without agreeing with the
// coordinator. The raw path has no review: it logs run-end and keeps its handle until raw.destroy().

type Source = "stage" | "raw";
type LogEntry = { t: number; event: GameStageEvent["event"]; payload: unknown; source: Source };
type RawOptions = { seed?: number; reducedMotion?: boolean; theme?: GameTheme; testHooks?: boolean; difficulty?: string; timeScale?: number };

interface ConformanceApi {
  readonly gameId: string;
  log: LogEntry[];
  handle(): GameHandle | null;
  setMounted(mounted: boolean): void;
  setGameId(id: string): void;
  setBoxWidth(px: number | null): void;
  setTheme(theme: GameTheme): void;
  raw: {
    importOnly(): Promise<void>;
    mount(opts?: RawOptions): void | Promise<void>;
    destroy(): void;
    handle(): GameHandle | null;
  };
}

declare global {
  interface Window {
    __conformance?: ConformanceApi;
  }
}

interface BenchProps {
  initialGameId: string;
  seed?: number;
  testHooks: boolean;
  reducedMotion?: boolean;
  difficulty?: string;
  timeScale?: number;
}

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const currentTheme = (): GameTheme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

function expose(api: ConformanceApi | null, previous?: ConformanceApi) {
  if (api) window.__conformance = api;
  else if (window.__conformance === previous) delete window.__conformance;
}

export function ConformanceBench({ initialGameId, seed, testHooks, reducedMotion, difficulty, timeScale }: BenchProps) {
  const [mounted, setMounted] = useState(true);
  const [gameId, setGameId] = useState(initialGameId);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  const log = useRef<LogEntry[]>([]);
  const stageHandle = useRef<GameHandle | null>(null);
  const gameIdRef = useRef(initialGameId);
  const rawStage = useRef<HTMLDivElement>(null);
  const progress = useGameProgress();

  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);

  const stage = benchStage(gameId);
  const onStageEvent = useCallback((e: GameStageEvent) => {
    log.current.push({ t: performance.now(), event: e.event, payload: e.payload, source: "stage" });
  }, []);
  const onStageHandle = useCallback((handle: GameHandle | null) => {
    stageHandle.current = handle;
  }, []);

  useEffect(() => {
    const record = (event: GameStageEvent) => log.current.push({ t: performance.now(), event: event.event, payload: event.payload, source: "raw" });
    const loaded = new Map<string, GameModule>();
    let rawHandle: GameHandle | null = null;
    let pending: { cancelled: boolean } | null = null;

    const importModule = (id: string) => {
      const entry = benchStage(id).entry;
      if (entry.status !== "ready") return Promise.reject(new Error(`${id} está en "próximamente": no tiene módulo`));
      return entry.load().then((gameModule) => {
        loaded.set(id, gameModule);
        return gameModule;
      });
    };

    const rawDestroy = () => {
      if (pending) {
        pending.cancelled = true;
        pending = null;
        record({ event: "destroyed", payload: null });
      }
      if (rawHandle) {
        rawHandle.destroy();
        rawHandle = null;
        record({ event: "destroyed", payload: null });
      }
    };

    const rawMount = (opts: RawOptions = {}): void | Promise<void> => {
      rawDestroy();
      const id = gameIdRef.current;
      const container = rawStage.current;
      if (!container) return;
      const mountWith = (gameModule: GameModule) => {
        const entry = benchStage(id).entry;
        const total = entry.status === "ready" ? entry.meta.total : 0;
        const useHooks = opts.testHooks ?? testHooks;
        rawHandle = gameModule.mountGame(container, {
          assetBase: `/games/${id}/`,
          theme: opts.theme ?? currentTheme(),
          tokens: readGameTokens(),
          reducedMotion: opts.reducedMotion ?? reducedMotion ?? prefersReducedMotion(),
          seed: opts.seed ?? seed,
          testHooks: useHooks,
          difficulty: opts.difficulty ?? difficulty ?? (entry.status === "ready" ? entry.meta.defaultDifficulty : undefined),
          timeScale: useHooks ? (opts.timeScale ?? timeScale) : undefined,
          onReady: () => record({ event: "ready", payload: null }),
          onProgress: (p) => record({ event: "progress", payload: p }),
          onCollect: (p) => record({ event: "collect", payload: p }),
          onCounter: (c) => record({ event: "counter", payload: c }),
          announce: (text) => record({ event: "announce", payload: text }),
          onComplete: (result) => record({ event: "complete", payload: result.total <= total ? result : { ...result, totalOverMax: total } } as GameStageEvent),
          onRunEnd: (summary) => record({ event: "run-end", payload: summary }),
          onError: (error) => record({ event: "error", payload: error instanceof Error ? error.message : String(error) }),
        });
      };
      const cached = loaded.get(id);
      if (cached) return mountWith(cached);
      const token = { cancelled: false };
      pending = token;
      return importModule(id).then((m) => {
        if (token.cancelled) return;
        pending = null;
        mountWith(m);
      });
    };

    const api: ConformanceApi = {
      get gameId() {
        return gameIdRef.current;
      },
      log: log.current,
      handle: () => stageHandle.current,
      setMounted,
      setGameId: (id) => {
        if (!BENCH_IDS.includes(id)) throw new Error(`gameId desconocido: ${id}`);
        gameIdRef.current = id;
        setGameId(id);
      },
      setBoxWidth,
      // Only the attribute, like ThemeToggle does, but without saving the preference (the bench writes no storage).
      setTheme: (theme) => document.documentElement.setAttribute("data-theme", theme),
      raw: {
        importOnly: () => importModule(gameIdRef.current).then(() => undefined),
        mount: rawMount,
        destroy: rawDestroy,
        handle: () => rawHandle,
      },
    };
    expose(api);
    return () => {
      rawDestroy();
      expose(null, api);
    };
  }, [seed, testHooks, reducedMotion, difficulty, timeScale]);

  return (
    <main className="bg-page text-fg" style={{ paddingInline: "clamp(16px,4vw,64px)" }}>
      <div className="flex h-[200vh] flex-col gap-6 pt-10">
        <div className="flex flex-col gap-3">
          <span className="eyebrow text-mute">Banco de conformidad · {gameId}</span>
          <h1 className="title-display m-0 text-[clamp(32px,5vw,64px)] leading-[0.9] text-head">Contrato de minijuegos</h1>
          <p className="m-0 max-w-[60ch] text-mute">
            Página para los tests del juez. Se maneja con <code>window.__conformance</code>; el juego está más abajo.
          </p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]" aria-label="Progreso guardado">
          {BENCH_IDS.map((id) => {
            const saved = progress[id];
            return (
              <li key={id} data-testid={`progress-${id}`}>
                {benchStage(id).title}: {saved ? `${saved.hits} / ${saved.total} · ${saved.score} puntos${saved.completed ? " · completado" : ""}` : "sin jugar"}
              </li>
            );
          })}
        </ul>
      </div>

      <div data-testid="box" className="mx-auto w-full max-w-full" style={boxWidth === null ? undefined : { width: boxWidth }}>
        {mounted && (
          <GameStage
            gameId={stage.gameId}
            portalId={stage.portalId}
            onReport={() => undefined}
            devOptions={{
              entryOverride: stage.entryOverride,
              seed,
              testHooks,
              reducedMotion,
              difficulty,
              timeScale,
              onHandle: onStageHandle,
              onEvent: onStageEvent,
            }}
          />
        )}
      </div>

      <div className="flex h-[200vh] flex-col gap-3 pt-24">
        <span className="eyebrow text-mute">Camino sin React (raw)</span>
        <div ref={rawStage} data-testid="raw-stage" tabIndex={0} className="relative aspect-video select-none bg-page-2 [&>canvas]:block" style={{ width: "min(640px, 100%)" }} />
      </div>
    </main>
  );
}
