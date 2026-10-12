"use client";

import { useEffect, useRef, useState } from "react";
import { QUESTION, TOTAL, type SceneSummary } from "@/lib/games/_dummy-scene/data";
import type { ReviewProps } from "@/lib/games/contract";

// HARNESS (E2): review step of `_dummy-scene` (its own chunk, no Phaser). One closing question that does not score
// (meta.hitsFrom "game"): the answer is reported for the log and the announcement, and the result is exactly what the
// scene found. Test interface as in E1: review-item (data-item-id = QUESTION.id), review-option-<id>, review-feedback
// (the explanation, always), review-next ("Ver resultado").

const summaryOf = (summary: unknown): Pick<SceneSummary, "hits" | "total" | "score"> => {
  const s = (summary ?? {}) as Partial<SceneSummary>;
  const int = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0);
  return { hits: int(s.hits), total: typeof s.total === "number" ? int(s.total) : TOTAL, score: int(s.score) };
};

export function Review({ summary, onAnswer, onDone }: ReviewProps) {
  const [found] = useState(() => summaryOf(summary));
  const [answer, setAnswer] = useState<string | null>(null);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (answer !== null) next.current?.focus();
  }, [answer]);

  const feedbackFor = (option: string) => `${option === QUESTION.answer ? "Correcto." : "No era esa."} ${QUESTION.explanation}`;

  // The explanation is shown and announced either way; the answer never changes the result.
  const choose = (option: string) => {
    if (answer !== null) return;
    setAnswer(option);
    onAnswer({ hit: option === QUESTION.answer, announcement: feedbackFor(option) });
  };

  return (
    <div className="flex flex-col items-start gap-5">
      <span className="eyebrow text-mute">
        Encontraste {found.hits} de {found.total}
      </span>
      <div data-testid="review-item" data-item-id={QUESTION.id}>
        <p className="m-0 text-[19px] leading-snug">{QUESTION.text}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {QUESTION.options.map((option) => (
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
          <p data-testid="review-feedback" className="m-0 max-w-[56ch] text-[17px] leading-snug">
            {feedbackFor(answer)}
          </p>
          <button
            ref={next}
            type="button"
            data-testid="review-next"
            onClick={() => onDone({ completed: true, ...found })}
            className="flex h-11 items-center rounded-[10px] border-0 bg-btn px-5 text-[15px] font-medium text-btn-fg"
          >
            Ver resultado
          </button>
        </>
      )}
    </div>
  );
}
