// HARNESS (E2): data of `_dummy-scene`, a fixed scene with zones to mark (a small water-signs). Pure: no Phaser, so the
// judge can import it in Node. Every position in scene px (SCENE); nothing is random (the seed is ignored).

export const SCENE = { width: 720, height: 900 } as const;

/** bg2 frame around the scene in the 4:5 design (design px). In 16:9 the scene fills the height, between bg2 bands. */
export const FRAME = 16;

export interface Zone {
  id: string;
  /** signal: scores when marked · decoy: spends a mark, scores nothing. */
  kind: "signal" | "decoy";
  x: number;
  y: number;
  r: number;
  points: number;
}

// Apart from each other (≥ 16 px between edges) and from the crosshair's start: a mark right after "Empezar" hits nothing.
export const ZONES: readonly Zone[] = [
  { id: "signal-1", kind: "signal", x: 160, y: 200, r: 64, points: 30 },
  { id: "signal-2", kind: "signal", x: 560, y: 260, r: 64, points: 20 },
  { id: "signal-3", kind: "signal", x: 200, y: 700, r: 64, points: 10 },
  { id: "decoy-1", kind: "decoy", x: 360, y: 180, r: 64, points: 0 },
  { id: "decoy-2", kind: "decoy", x: 560, y: 560, r: 64, points: 0 },
  { id: "decoy-3", kind: "decoy", x: 480, y: 760, r: 64, points: 0 },
];

/** Signals in the scene: result.total, in every difficulty. */
export const TOTAL = ZONES.filter((z) => z.kind === "signal").length;

/** Marks per difficulty. With "fast" the three decoys use them all: the hits === 0 result is reachable. */
export const MARKS: Record<string, number> = { calm: 5, fast: 3 };
export const DEFAULT_DIFFICULTY = "calm";

export const marksFor = (difficulty: string | undefined) => MARKS[difficulty ?? DEFAULT_DIFFICULTY] ?? MARKS[DEFAULT_DIFFICULTY];

/** Keyboard crosshair (shared/crosshair.ts): starts at the center; one press = `step`. */
export const CROSSHAIR = { startX: 360, startY: 450, step: 20, holdDelayMs: 300, speed: 360, maxSpeed: 900, rampMs: 600 } as const;

/** A pointer marks on release only if it moved at most this (design px) since it went down: a swipe never marks. */
export const TAP_SLOP = 16;

/** Duration of a marker's entrance (shared/motion.ts appear), the only non-essential motion. */
export const MARKER_APPEAR_MS = 150;

/** The zone under a point, or null (empty scene). */
export function zoneAt(x: number, y: number): Zone | null {
  return ZONES.find((z) => Math.hypot(x - z.x, y - z.y) <= z.r) ?? null;
}

/** Hits and score of a set of marked zones (unknown ids count for nothing). */
export function scoreOf(markedIds: readonly string[]): { hits: number; score: number } {
  const marked = ZONES.filter((z) => z.kind === "signal" && markedIds.includes(z.id));
  return { hits: marked.length, score: marked.reduce((sum, z) => sum + z.points, 0) };
}

/** The review's single question: answering does not score (meta.hitsFrom "game"). */
export const QUESTION = {
  id: "question",
  text: "Pregunta de cierre: ¿las señales de esta escena se ven mejor de cerca o de lejos?",
  options: [
    { id: "near", label: "De cerca" },
    { id: "far", label: "De lejos" },
  ],
  answer: "far",
  explanation: "De lejos: en una escena fija conviene mirar el conjunto antes de marcar. Esta pregunta no suma ni resta.",
} as const;

/** What the scene hands to the review (onRunEnd). */
export interface SceneSummary {
  difficulty: string;
  marks: number;
  found: string[];
  decoys: string[];
  hits: number;
  total: number;
  score: number;
}
