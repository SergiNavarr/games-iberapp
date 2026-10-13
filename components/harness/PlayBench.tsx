"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameStage, type GameStageEvent } from "@/components/games/GameStage";
import { BENCH_IDS, benchStage } from "@/components/harness/bench-games";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PORTALS } from "@/lib/data/portals";
import type { DebugScene, GameHandle } from "@/lib/games/contract";
import { useGameProgress } from "@/lib/storage/game-progress";

// HARNESS (T4, G2): visual bench for people (not used by tests): portal, theme, reduced motion, box width and a log
// of the wrapper's events. The stage proportion still follows the viewport (tab: at 700 px), as it will in the section.
// "Zonas" (scene games): draws the sensitive zones over the stage, in the DOM, from debugScene() (the bench mounts
// with testHooks), so a fixed scene can be played and its coordinates checked on the placeholder. Never in the canvas.

const WIDTHS = [360, 768, 1024, 1440] as const;
type Motion = "system" | "on" | "off";
type Overlay = { left: number; top: number; width: number; height: number; scene: DebugScene };

export function PlayBench({ gameId }: { gameId: string }) {
  const stage = benchStage(gameId);
  const [portalId, setPortalId] = useState(stage.portalId);
  const [width, setWidth] = useState<number | null>(null);
  const [motion, setMotion] = useState<Motion>("system");
  const [log, setLog] = useState<{ t: number; text: string }[]>([]);
  const [showZones, setShowZones] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const progress = useGameProgress();

  // Polls the scene while "Zonas" is on (bench only): the zones follow marks, resizes and layout changes.
  useEffect(() => {
    if (!showZones) return;
    let last = "";
    const timer = setInterval(() => {
      const box = boxRef.current;
      const stageEl = box?.querySelector('[data-testid="stage"]');
      const scene = handleRef.current?.debugScene?.() ?? null;
      let next: Overlay | null = null;
      if (box && stageEl && scene) {
        const b = box.getBoundingClientRect();
        const s = stageEl.getBoundingClientRect();
        next = { left: s.left - b.left, top: s.top - b.top, width: s.width, height: s.height, scene };
      }
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      setOverlay(next);
    }, 150);
    return () => clearInterval(timer);
  }, [showZones]);

  const onEvent = (e: GameStageEvent) => {
    const text = `${e.event}${e.payload === null ? "" : ` ${typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload)}`}`;
    setLog((prev) => [{ t: Math.round(performance.now()), text }, ...prev].slice(0, 60));
  };

  const saved = progress[gameId];

  return (
    <main className="flex min-h-dvh flex-col gap-8 bg-page py-10 text-fg" style={{ paddingInline: "clamp(16px,4vw,64px)" }}>
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-mute">Banco visual · {gameId}</span>
          <nav className="flex flex-wrap gap-3 text-[15px]">
            {BENCH_IDS.map((id) => (
              <Link key={id} href={`/play/${id}`} aria-current={id === gameId ? "page" : undefined} className="link-underline text-fg no-underline">
                {benchStage(id).title}
              </Link>
            ))}
          </nav>
        </div>
        <ThemeToggle color="var(--fg)" borderColor="var(--rule)" />
      </header>

      <section className="flex flex-wrap items-end gap-6 text-[15px]" aria-label="Controles del banco">
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-mute">Portal</span>
          <select value={portalId} onChange={(e) => setPortalId(e.target.value)} className="h-10 rounded-[10px] border border-rule bg-page-2 px-3 text-fg">
            {PORTALS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.game === stage.gameId ? " (de este juego)" : ""}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="eyebrow mb-1 text-mute">Movimiento reducido</legend>
          <div className="flex gap-2">
            {(["system", "on", "off"] as const).map((m) => (
              <BenchButton key={m} active={motion === m} onClick={() => setMotion(m)}>
                {m === "system" ? "Sistema" : m === "on" ? "Sí" : "No"}
              </BenchButton>
            ))}
          </div>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="eyebrow mb-1 text-mute">Ancho de la caja</legend>
          <div className="flex flex-wrap gap-2">
            {WIDTHS.map((w) => (
              <BenchButton key={w} active={width === w} onClick={() => setWidth(w)}>
                {w}
              </BenchButton>
            ))}
            <BenchButton active={width === null} onClick={() => setWidth(null)}>
              Libre
            </BenchButton>
          </div>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="eyebrow mb-1 text-mute">Zonas</legend>
          <div className="flex gap-2">
            <BenchButton active={showZones} onClick={() => setShowZones(true)}>
              Ver
            </BenchButton>
            <BenchButton active={!showZones} onClick={() => setShowZones(false)}>
              Ocultar
            </BenchButton>
          </div>
        </fieldset>
        <p className="m-0 text-mute">Guardado: {saved ? `${saved.hits} / ${saved.total}${saved.completed ? " · completado" : ""}` : "sin jugar"}</p>
      </section>

      <div className="max-w-full overflow-x-auto">
        <div ref={boxRef} className="relative" style={width === null ? undefined : { width }}>
          <GameStage
            key={motion}
            gameId={stage.gameId}
            portalId={portalId}
            onReport={() => onEvent({ event: "report", payload: null })}
            devOptions={{
              entryOverride: stage.entryOverride,
              reducedMotion: motion === "system" ? undefined : motion === "on",
              testHooks: true,
              onHandle: (handle) => {
                handleRef.current = handle;
              },
              onEvent,
            }}
          />
          {showZones && overlay && <ZoneOverlay overlay={overlay} />}
        </div>
      </div>

      <section className="flex flex-col gap-2" aria-label="Eventos del wrapper">
        <span className="eyebrow text-mute">Eventos</span>
        <ol className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0 font-mono text-[13px] text-mute">
          {log.map((entry, i) => (
            <li key={log.length - i}>
              {entry.t} ms · {entry.text}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

/** The scene's zones over the stage (signals in mint, distractors in orange; marked ones filled), with their ids. */
function ZoneOverlay({ overlay }: { overlay: Overlay }) {
  const { left, top, width, height, scene } = overlay;
  const { view } = scene;
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute" style={{ left, top, width, height }} viewBox={`0 0 ${width} ${height}`}>
      {scene.zones.map((z) => {
        const color = z.kind === "signal" ? "var(--color-mint)" : "var(--color-orange)";
        const cx = view.left + z.x * view.scale;
        const cy = view.top + z.y * view.scale;
        return (
          <g key={z.id}>
            <circle cx={cx} cy={cy} r={z.r * view.scale} fill={z.marked ? color : "none"} fillOpacity={0.25} stroke={color} strokeWidth={2} strokeDasharray="6 4" />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill={color} stroke="var(--bg2)" strokeWidth={3} paintOrder="stroke">
              {z.id}
            </text>
          </g>
        );
      })}
      <circle cx={view.left + scene.crosshair.x * view.scale} cy={view.top + scene.crosshair.y * view.scale} r={3} fill="var(--head)" />
    </svg>
  );
}

function BenchButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 rounded-[10px] border px-3 text-[15px] ${active ? "border-transparent bg-btn text-btn-fg" : "border-rule bg-transparent text-fg"}`}
    >
      {children}
    </button>
  );
}
