"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewProps } from "@/lib/games/contract";

// HARNESS (E1): review step of `_dummy-run`, loaded by GameStage after onRunEnd (its own chunk, no Phaser). One
// question per collected object. Fixed test interface shared by every review component: review-item (data-item-id =
// debugRun().items[].id), review-option-<answerId> buttons, review-feedback, review-next ("Ver resultado" on the last).

interface Collected {
  id: string;
  type: "round" | "square";
  answer: "round" | "square";
  points: number;
}

const OPTIONS = [
  { id: "round", label: "Redondo" },
  { id: "square", label: "Cuadrado" },
] as const;

const collectedOf = (summary: unknown): Collected[] =>
  summary && typeof summary === "object" && Array.isArray((summary as { collected?: unknown }).collected) ? (summary as { collected: Collected[] }).collected : [];

export function Review({ summary, onAnswer, onDone }: ReviewProps) {
  const [items] = useState(() => collectedOf(summary));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const tally = useRef({ hits: 0, score: 0 });
  const next = useRef<HTMLButtonElement>(null);

  // Nothing collected: straight to the result (total 0); GameStage shows meta.emptyResult.
  useEffect(() => {
    if (items.length === 0) onDone({ completed: true, hits: 0, total: 0, score: 0 });
  }, [items, onDone]);

  useEffect(() => {
    if (answer !== null) next.current?.focus();
  }, [answer]);

  if (items.length === 0) return null;
  const item = items[index];
  const last = index === items.length - 1;
  const label = (id: string) => OPTIONS.find((o) => o.id === id)?.label.toLowerCase();

  const choose = (option: string) => {
    if (answer !== null) return;
    const hit = option === item.answer;
    if (hit) {
      tally.current.hits += 1;
      tally.current.score += item.points;
    }
    setAnswer(option);
    onAnswer({ hit, announcement: hit ? `Correcto: era ${label(item.answer)}. Suma ${item.points} puntos.` : `No: era ${label(item.answer)}.` });
  };

  const advance = () => {
    if (last) {
      onDone({ completed: true, hits: tally.current.hits, total: items.length, score: tally.current.score });
      return;
    }
    setIndex(index + 1);
    setAnswer(null);
  };

  const hit = answer === item.answer;

  return (
    <div className="flex flex-col items-start gap-5">
      <span className="eyebrow text-mute">
        Revisión · {index + 1} de {items.length}
      </span>
      <div data-testid="review-item" data-item-id={item.id} className="flex items-center gap-4">
        <span aria-hidden="true" className={`block h-14 w-14 bg-mint ${item.type === "round" ? "rounded-full" : "rounded-[4px]"}`} />
        <p className="m-0 text-[19px] leading-snug">Objeto {index + 1}: ¿es redondo o cuadrado?</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            data-testid={`review-option-${option.id}`}
            disabled={answer !== null}
            onClick={() => choose(option.id)}
            className="flex h-11 items-center rounded-[10px] border border-rule bg-transparent px-5 text-[15px] font-medium text-fg disabled:opacity-60"
          >
            {option.label}
          </button>
        ))}
      </div>
      {answer !== null && (
        <>
          <p data-testid="review-feedback" className="m-0 text-[17px] leading-snug">
            {hit ? `¡Bien! Era ${label(item.answer)}.` : `Era ${label(item.answer)}.`}
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
