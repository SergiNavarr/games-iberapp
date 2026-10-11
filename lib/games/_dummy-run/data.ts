import { createRandom } from "@/lib/games/shared/random";

// HARNESS (E1): the run of `_dummy-run`, as pure data (no Phaser, importable in Node). Positions are fractions of the
// design width (the scene turns them into px for 16:9 or 4:5); times are game ms.

export type ObjectType = "round" | "square" | "obstacle";

export interface RunObject {
  /** "item-1"… in order of arrival, "obstacle-1", "obstacle-2". */
  id: string;
  kind: "item" | "obstacle";
  type: ObjectType;
  /** x as a fraction of the design width. */
  fx: number;
  /** Game ms at which it crosses the player's line. */
  arriveAt: number;
  /** Correct review option ("round" | "square"); null for obstacles. */
  answer: string | null;
  points: number;
}

export interface RunPlan {
  durationMs: number;
  /** Ms an object is on screen before it reaches the player's line (speed in "seconds of visibility"). */
  visibleMs: number;
  objects: RunObject[];
}

export const DIFFICULTIES = {
  calm: { count: 4, durationMs: 10_000, visibleMs: 1_800 },
  fast: { count: 6, durationMs: 8_000, visibleMs: 1_400 },
} as const;

export const PLAYER = { width: 96, height: 48, speed: 900, startFx: 0.5 } as const; // speed: design px/s
export const ITEM_SIZE = 64;
export const OBSTACLE = { width: 120, height: 40 } as const;
export const PICKUP_HALF_WIDTH = (PLAYER.width + ITEM_SIZE) / 2;
export const OBSTACLE_HALF_WIDTH = (PLAYER.width + OBSTACLE.width) / 2;
export const POINTS = { round: 10, square: 5 } as const;
/** The lane the player moves in; items always appear within 35–85 % (so holding ArrowLeft collects nothing). */
export const LANE = { left: 0.15, right: 0.85, itemMin: 0.35, itemMax: 0.85 } as const;
/** Reachability between consecutive items: a 0.7 margin on the player's speed, 50 ms of control latency, ≥ 600 ms apart. */
export const REACH = { factor: 0.7, latencyMs: 50, minGapMs: 600 } as const;
/** The widest layout (16:9) has the largest px distances for the same fractions: reachability is planned there. */
const WIDEST = 1280;
/** The two obstacles reach the player's starting x this far apart (< 500 ms: the flash cooldown gets exercised). */
const OBSTACLE_GAP_MS = 300;

export function difficultyOf(id: string | undefined) {
  return id === "fast" ? DIFFICULTIES.fast : DIFFICULTIES.calm;
}

/** Most px the player can still cover between two arrivals `gapMs` apart, plus the pickup tolerance. */
export function reachablePx(gapMs: number) {
  return (REACH.factor * PLAYER.speed * Math.max(0, gapMs - REACH.latencyMs)) / 1000 + PICKUP_HALF_WIDTH;
}

/** The planned run for a difficulty and seed. Same inputs, same plan (the composition never depends on the seed). */
export function buildRun(difficulty: string | undefined, seed?: number, random: () => number = createRandom(seed)): RunPlan {
  const { count, durationMs, visibleMs } = difficultyOf(difficulty);

  // Half round, half square, order shuffled by the seed.
  const types: ("round" | "square")[] = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? "round" : "square"));
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  // Arrivals spread over the run with a bounded jitter: every gap stays ≥ REACH.minGapMs.
  const first = visibleMs + 400;
  const last = durationMs - 400;
  const slot = (last - first) / Math.max(1, count - 1);
  const times = types.map((_, i) => Math.round(first + i * slot + (i > 0 && i < count - 1 ? (random() - 0.5) * 0.3 * slot : 0)));

  // x: each item reachable from the previous one (from the player's start for the first).
  const objects: RunObject[] = [];
  let prevFx: number = PLAYER.startFx;
  let prevT = 0;
  times.forEach((t, i) => {
    const range = reachablePx(t - prevT) / WIDEST;
    const min = Math.max(LANE.itemMin, prevFx - range);
    const max = Math.min(LANE.itemMax, prevFx + range);
    const fx = Math.round((min + random() * (max - min)) * 1000) / 1000;
    const type = types[i];
    objects.push({ id: `item-${i + 1}`, kind: "item", type, fx, arriveAt: t, answer: type, points: POINTS[type] });
    prevFx = fx;
    prevT = t;
  });

  // Two obstacles at the player's starting x, in the widest gap between items, OBSTACLE_GAP_MS apart.
  let widest = 0;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > times[widest + 1] - times[widest]) widest = i - 1;
  const middle = Math.round((times[widest] + times[widest + 1]) / 2);
  objects.push(
    { id: "obstacle-1", kind: "obstacle", type: "obstacle", fx: PLAYER.startFx, arriveAt: middle - OBSTACLE_GAP_MS / 2, answer: null, points: 0 },
    { id: "obstacle-2", kind: "obstacle", type: "obstacle", fx: PLAYER.startFx, arriveAt: middle + OBSTACLE_GAP_MS / 2, answer: null, points: 0 },
  );

  return { durationMs, visibleMs, objects: objects.sort((a, b) => a.arriveAt - b.arriveAt) };
}
