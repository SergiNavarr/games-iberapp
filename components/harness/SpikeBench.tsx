"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { mountSpike, type SpikeHandle, type SpikePalette, type SpikeRenderer } from "@/lib/games/_spike";

// HARNESS (T2): bench for the Phaser spike. `window.__spike` is a fixed contract with the judge's tests
// (tests/conformance/spike/): do not change its shape, the data-testid or the route without asking.

type LogEvent = "ready" | "destroyed" | "target-hit";

interface SpikeApi {
  mount(opts?: { reducedMotion?: boolean }): void;
  unmount(): void;
  raw: { mount(): void; destroy(): void };
  renderer(): SpikeRenderer | null;
  resizeStage(width: number, height: number): void;
  log: { t: number; event: LogEvent }[];
}

declare global {
  interface Window {
    __spike?: SpikeApi;
  }
}

const ASSET_BASE = "/games/_spike/";

/** Tokens resolved from the landing's CSS (globals.css), as the wrapper will do: the canvas cannot read CSS. */
function readPalette(): SpikePalette {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: token("--bg2"),
    mover: token("--color-sky"),
    target: token("--color-yellow"),
    targetHit: token("--color-mint"),
    player: token("--color-leaf"),
    placeholder: token("--mute"),
  };
}

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Session {
  id: number;
  reducedMotion: boolean;
}

export function SpikeBench() {
  const stageRef = useRef<HTMLDivElement>(null);
  const reactHandle = useRef<SpikeHandle | null>(null);
  const rawHandle = useRef<SpikeHandle | null>(null);
  const log = useRef<SpikeApi["log"]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  // React path (the one that exercises Strict Mode): import() + mountSpike in the effect, destroy in the cleanup.
  useEffect(() => {
    const stage = stageRef.current;
    if (!session || !stage) return;
    const push = (event: LogEvent) => log.current.push({ t: performance.now(), event });
    let disposed = false;
    let handle: SpikeHandle | null = null;

    import("@/lib/games/_spike").then(({ mountSpike }) => {
      if (disposed) return;
      handle = mountSpike(stage, {
        assetBase: ASSET_BASE,
        palette: readPalette(),
        reducedMotion: session.reducedMotion,
        onReady: () => push("ready"),
        onTargetHit: () => push("target-hit"),
      });
      reactHandle.current = handle;
    });

    return () => {
      disposed = true;
      if (!handle) return;
      handle.destroy();
      push("destroyed");
      if (reactHandle.current === handle) reactHandle.current = null;
    };
  }, [session]);

  useEffect(() => {
    const push = (event: LogEvent) => log.current.push({ t: performance.now(), event });
    let nextId = 0;

    const rawDestroy = () => {
      if (!rawHandle.current) return;
      rawHandle.current.destroy();
      rawHandle.current = null;
      push("destroyed");
    };

    const api: SpikeApi = {
      mount: (opts) => setSession({ id: ++nextId, reducedMotion: opts?.reducedMotion ?? prefersReducedMotion() }),
      unmount: () => setSession(null),
      raw: {
        // Straight to mountSpike/destroy on the same stage, no React in between (destroy before boot).
        mount: () => {
          const stage = stageRef.current;
          if (!stage) return;
          rawDestroy();
          rawHandle.current = mountSpike(stage, {
            assetBase: ASSET_BASE,
            palette: readPalette(),
            reducedMotion: prefersReducedMotion(),
            onReady: () => push("ready"),
            onTargetHit: () => push("target-hit"),
          });
        },
        destroy: rawDestroy,
      },
      renderer: () => (reactHandle.current ?? rawHandle.current)?.renderer() ?? null,
      resizeStage: (width, height) => setStageSize({ width, height }),
      log: log.current,
    };
    window.__spike = api;

    return () => {
      rawDestroy();
      if (window.__spike === api) delete window.__spike;
    };
  }, []);

  return (
    <main className="bg-page text-fg" style={{ paddingInline: "clamp(24px,4vw,64px)" }}>
      <div className="flex h-[200vh] flex-col items-start gap-4 pt-10">
        <div className="flex w-full items-start justify-between gap-6">
          <div className="flex flex-col gap-3">
            <span className="eyebrow text-mute">Banco de pruebas · Spike de Phaser 3.90</span>
            <h1 className="title-display m-0 text-[clamp(36px,5vw,72px)] leading-[0.9] text-head">Spike</h1>
          </div>
          <ThemeToggle color="var(--fg)" borderColor="var(--rule)" />
        </div>
        <p className="m-0 max-w-[60ch] text-mute">
          No se monta nada al cargar. Montá desde acá o con <code>window.__spike</code> en la consola; el escenario está más abajo.
        </p>
        <div className="flex flex-wrap gap-2">
          <BenchButton onClick={() => window.__spike?.mount()}>Montar</BenchButton>
          <BenchButton onClick={() => window.__spike?.mount({ reducedMotion: true })}>Montar sin movimiento</BenchButton>
          <BenchButton onClick={() => window.__spike?.unmount()}>Desmontar</BenchButton>
        </div>
      </div>

      <div
        ref={stageRef}
        data-testid="stage"
        tabIndex={0}
        aria-label="Escenario del spike"
        className="relative aspect-[4/5] w-full select-none overflow-hidden bg-page-2 tab:aspect-video [&>canvas]:block"
        style={stageSize ? { width: stageSize.width, height: stageSize.height, aspectRatio: "auto" } : undefined}
      />

      <div className="h-[200vh]" aria-hidden="true" />
    </main>
  );
}

function BenchButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="h-10 rounded-[10px] border border-rule bg-transparent px-4 text-[15px] font-medium text-fg">
      {children}
    </button>
  );
}
