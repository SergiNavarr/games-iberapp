"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewProps } from "@/lib/games/contract";
import { BINS, WASTE, type BinId, type WasteId } from "@/lib/games/clean-channels/meta";

// Phase 3 of clean-channels (specification): one collected piece at a time, four bins, immediate feedback that
// explains why. A right answer adds the piece's points; a wrong one adds nothing, never subtracts, and still shows the
// explanation. Loaded by GameStage after onRunEnd (its own chunk, no Phaser). Test interface shared by every review
// (E1): review-item (data-item-id = debugRun().items[].id), review-option-<bin>, review-feedback, review-next.

interface Collected {
  id: string;
  type: WasteId;
  bin: BinId;
  points: number;
}

const collectedOf = (summary: unknown): Collected[] =>
  summary && typeof summary === "object" && Array.isArray((summary as { collected?: unknown }).collected) ? (summary as { collected: Collected[] }).collected : [];

const binLabel = (id: BinId) => BINS.find((b) => b.id === id)?.label ?? id;

export function Review({ summary, onAnswer, onDone }: ReviewProps) {
  const [items] = useState(() => collectedOf(summary));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<BinId | null>(null);
  const tally = useRef({ hits: 0, score: 0 });
  const next = useRef<HTMLButtonElement>(null);

  // Nothing collected: the classification is skipped (specification); GameStage shows meta.emptyResult.
  useEffect(() => {
    if (items.length === 0) onDone({ completed: true, hits: 0, total: 0, score: 0 });
  }, [items, onDone]);

  useEffect(() => {
    if (answer !== null) next.current?.focus();
  }, [answer]);

  if (items.length === 0) return null;
  const item = items[index];
  const info = WASTE[item.type];
  const last = index === items.length - 1;
  const hit = answer === info.bin;

  const choose = (bin: BinId) => {
    if (answer !== null) return;
    const right = bin === info.bin;
    if (right) {
      tally.current.hits += 1;
      tally.current.score += info.points;
    }
    setAnswer(bin);
    onAnswer({
      hit: right,
      announcement: right ? `Correcto: ${info.name} va en ${binLabel(info.bin)}. Suma ${info.points} puntos.` : `No: ${info.name} va en ${binLabel(info.bin)}.`,
    });
  };

  const advance = () => {
    if (last) {
      onDone({ completed: true, hits: tally.current.hits, total: items.length, score: tally.current.score });
      return;
    }
    setIndex(index + 1);
    setAnswer(null);
  };

  return (
    <div className="flex flex-col items-start gap-5">
      <span className="eyebrow text-mute">
        Clasificación · {index + 1} de {items.length}
      </span>
      <div data-testid="review-item" data-item-id={item.id} className="flex flex-col gap-1">
        <h4 className="title-display m-0 text-[clamp(24px,3vw,34px)] leading-none text-head">{info.name}</h4>
        <p className="m-0 text-[17px] leading-snug text-mute">¿En qué contenedor va?</p>
      </div>
      <div className="grid w-full max-w-[640px] grid-cols-2 gap-3">
        {BINS.map((bin) => {
          const chosen = answer === bin.id;
          const correct = answer !== null && bin.id === info.bin;
          return (
            <button
              key={bin.id}
              type="button"
              data-testid={`review-option-${bin.id}`}
              disabled={answer !== null}
              onClick={() => choose(bin.id)}
              className={`flex min-h-14 items-center gap-3 rounded-[10px] border px-4 py-3 text-left text-[15px] font-medium transition-colors ${
                correct ? "border-mint text-head" : chosen ? "border-orange text-head" : "border-rule text-fg"
              } bg-transparent disabled:cursor-default`}
            >
              <BinIcon bin={bin.id} />
              {bin.label}
            </button>
          );
        })}
      </div>
      {answer !== null && (
        <>
          <p data-testid="review-feedback" className="m-0 max-w-[60ch] text-[17px] leading-snug">
            <strong className={hit ? "text-mint" : "text-orange"}>{hit ? `¡Bien! +${info.points} puntos.` : `Va en ${binLabel(info.bin)}.`}</strong> {hit ? info.correct : info.wrong}
          </p>
          <button
            ref={next}
            type="button"
            data-testid="review-next"
            onClick={advance}
            className="flex h-11 items-center rounded-[10px] border-0 bg-btn px-5 text-[15px] font-medium text-btn-fg"
          >
            {last ? "Ver resultado" : "Siguiente"}
          </button>
        </>
      )}
    </div>
  );
}

// The four bins, drawn like the landing's Icon.tsx: 24 grid, 1.7 stroke, round joins.
function BinIcon({ bin }: { bin: BinId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="block flex-none">
      {bin === "recyclable" && (
        <>
          <path {...common} d="M7.5 9.5 10 5.2a2.3 2.3 0 0 1 4 0l1.6 2.8" />
          <path {...common} d="m13.4 7.9 2.2.1 1.1-1.9" />
          <path {...common} d="M18.2 12.2 20.6 16.5a2.3 2.3 0 0 1-2 3.5h-3.1" />
          <path {...common} d="m16.6 18.2-1.1 1.8 1.2 1.9" />
          <path {...common} d="M9 20H5.4a2.3 2.3 0 0 1-2-3.5L5 13.7" />
          <path {...common} d="m3.9 14.6 1.1-1.9 2.2.1" />
        </>
      )}
      {bin === "organic" && (
        <>
          <path {...common} d="M5 19C5 10.5 11 5 19.5 4.5 19.5 13 14 19 5 19Z" />
          <path {...common} d="M5 19 13 11" />
        </>
      )}
      {bin === "general" && (
        <>
          <path {...common} d="M4 6.5h16" />
          <path {...common} d="M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
          <path {...common} d="M6 6.5h12l-1 13a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 19.5Z" />
        </>
      )}
      {bin === "special" && (
        <>
          <rect {...common} x="7" y="5.5" width="10" height="15" rx="1.8" />
          <path {...common} d="M10 3.5h4" />
          <path {...common} d="M12.8 9.5 10.8 13h2.6l-2 3.5" />
        </>
      )}
    </svg>
  );
}
