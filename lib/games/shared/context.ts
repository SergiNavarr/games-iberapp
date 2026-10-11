import type * as Phaser from "phaser";
import type { DebugRun, DebugTexture } from "@/lib/games/contract";
import type { ManifestEntry } from "./assets";
import type { Palette } from "./palette";

const CONTEXT_KEY = "ibera:context";
export const PALETTE_KEY = "ibera:palette";

/** A tappable target as the scene knows it: world (design) px. Run games report their visible, uncollected items. */
export interface SceneTarget {
  id: string;
  x: number;
  y: number;
  kind?: "item" | "obstacle";
}

/** What a run scene reports for handle.debugRun(); the runtime adds difficulty, layout, timeScale and elapsedMs. */
export type SceneRun = Pick<DebugRun, "durationMs" | "ended" | "player" | "kinematics" | "items" | "spawns">;

/** Non-essential motion created through shared/motion.ts, for handle.debugMotion(). Times in game ms. */
export interface MotionStats {
  created: number;
  /** One probe per effect created: true while it is running. */
  effects: (() => boolean)[];
  flashes: number[];
  shakes: number[];
  staticFeedback: number[];
  collisions: number[];
}

/**
 * What a game's scenes get from the runtime (shared/runtime.ts). The scenes never see the GameConfig callbacks:
 * these wrappers enforce the contract invariants (once, never after destroy, no input after the end).
 */
export interface GameContext {
  readonly assetBase: string;
  readonly reducedMotion: boolean;
  /** meta.total (single-phase games: the result total). */
  readonly total: number;
  readonly manifest: readonly ManifestEntry[];
  /** config.difficulty: one of meta.difficulties[].id, or undefined. */
  readonly difficulty: string | undefined;
  /** Effective time scale: config.timeScale with testHooks, otherwise 1. */
  readonly timeScale: number;
  /** Seeded when the config has a seed. Use it for anything random in the mechanic. */
  readonly random: () => number;
  /** Game time in ms: scaled by timeScale, pauses excluded. Drive every simulation with it (see clock.ts). */
  now(): number;
  /** Simulation ms of the run (clock.ts registers it), or now() for games without a stepper. The time base of debugMotion. */
  simNow(): number;
  setSimClock(clock: (() => number) | null): void;
  palette(): Palette;
  /** Assets ready (or replaced): reports onReady, once. */
  ready(): void;
  /** Single-phase games: reports onProgress when `hits` changed. */
  progress(hits: number, total?: number): void;
  /** Run games: reports onCollect when the count changed. */
  collect(collected: number, inChannel: number): void;
  announce(text: string): void;
  /** Single-phase games: reports onComplete once (total defaults to meta.total, score to hits) and stops all input. */
  complete(result: { completed: boolean; hits: number; total?: number; score?: number }): void;
  /** Run games: reports onRunEnd once with an opaque summary for the review, and stops all input. */
  runEnd(summary: unknown): void;
  fail(error: unknown): void;
  /** True after complete(), runEnd(), fail() or destroy(): ignore input. */
  isOver(): boolean;
  /** For handle.debugTargets(): the scene's current tappable targets. */
  setTargets(provider: (() => SceneTarget[]) | null): void;
  /** For handle.debugRun(): the run as the scene is playing it. */
  setRun(provider: (() => SceneRun) | null): void;
  /** Filled by prepareManifest() (assets.ts). */
  textureSources: Map<string, DebugTexture["source"]>;
  /** Filled by motion.ts. */
  motionStats: MotionStats;
}

export function setGameContext(game: Phaser.Game, context: GameContext) {
  game.registry.set(CONTEXT_KEY, context);
}

export function gameContext(scene: Phaser.Scene): GameContext {
  return scene.registry.get(CONTEXT_KEY) as GameContext;
}

/** Calls `paint` now and on every theme change (handle.setTheme) until the scene shuts down. */
export function onPalette(scene: Phaser.Scene, paint: (palette: Palette) => void) {
  const handler = (_parent: unknown, value: Palette) => paint(value);
  scene.registry.events.on(`changedata-${PALETTE_KEY}`, handler);
  const off = () => scene.registry.events.off(`changedata-${PALETTE_KEY}`, handler);
  scene.events.once("shutdown", off);
  scene.events.once("destroy", off);
  paint(gameContext(scene).palette());
}
