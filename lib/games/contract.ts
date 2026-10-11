import { z } from "zod";
import type { GameId } from "@/types/portal";

// Contract between the landing (GameStage) and every game module (plan §2.2). No Phaser here: the wrapper imports this
// file eagerly, and a game is only reached through its registry entry's load().

export type GameTheme = "dark" | "light";

/** Landing tokens the canvas may paint with, resolved by the wrapper (getComputedStyle) as CSS color strings. */
export const TOKEN_NAMES = ["bg2", "fg", "head", "mute", "rule", "mint", "leaf", "yellow", "orange", "sky"] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type GameTokens = Record<TokenName, string>;

const resultShape = {
  completed: z.boolean(),
  hits: z.number().int().min(0),
  total: z.number().int().min(0),
};
const hitsWithinTotal = (r: { hits: number; total: number }) => r.hits <= r.total;

/** `onComplete` payload, the same for every game (P2, P14). */
export const gameResultSchema = z.object(resultShape).refine(hitsWithinTotal, { message: "hits > total" });
export type GameResult = z.infer<typeof gameResultSchema>;

/** One entry of localStorage["ibera-games-progress"], keyed by game id (P1). */
export const progressEntrySchema = z.object({ ...resultShape, savedAt: z.iso.datetime() }).refine(hitsWithinTotal, { message: "hits > total" });
export type ProgressEntry = z.infer<typeof progressEntrySchema>;

/** Pure data read by the wrapper before the game loads. Title and description come from GAMES (landing). */
export interface GameMeta {
  /** Paragraphs shown before "Empezar". */
  instructions: string[];
  controls: { pointer: string; keyboard: string };
  /** What the game teaches, shown on the result screen. */
  learning: string;
  /** Possible hits; `result.total` always equals it. */
  total: number;
  /** Noun for the score, e.g. "residuos". */
  scoreLabel: string;
  /** A point (logical design px) that is background in every layout: the theme test reads its color. */
  backgroundProbe: { x: number; y: number };
}

export interface GameConfig {
  /** Ends in "/", e.g. "/games/clean-channels/". The only place the game requests files from. */
  assetBase: string;
  theme: GameTheme;
  tokens: GameTokens;
  reducedMotion: boolean;
  /** Makes the game deterministic. Tests only; production leaves it out. */
  seed?: number;
  /** Enables handle.debugTargets() and handle.debugTextures(). Test benches only. */
  testHooks?: boolean;
  /** Assets loaded (or replaced by placeholders) and first scene ready. At most once. */
  onReady: () => void;
  /** Once per change of hits, never per frame. */
  onProgress: (progress: { hits: number; total: number }) => void;
  /** Spanish text for the wrapper's aria-live="polite" region. */
  announce: (text: string) => void;
  /** At most once; afterwards the game ignores input. */
  onComplete: (result: GameResult) => void;
  /** Unrecoverable error. */
  onError: (error: unknown) => void;
}

/** A tappable target, in CSS px relative to the container (testHooks). */
export interface DebugTarget {
  id: string;
  x: number;
  y: number;
}

/** A manifest texture as the game uses it (testHooks). `frames`: sliced frames for spritesheets, 1 for images. */
export interface DebugTexture {
  key: string;
  width: number;
  height: number;
  frames: number;
  /** file: the file matches the manifest · scaled: redrawn at the manifest size · placeholder: the file is missing. */
  source: "file" | "scaled" | "placeholder";
}

export interface GameHandle {
  /** Idempotent, safe before boot, releases the WebGL context and every listener. No callback runs afterwards. */
  destroy(): void;
  /** No requestAnimationFrame while paused. */
  pause(): void;
  resume(): void;
  /** Repaints the same canvas, without remounting. */
  setTheme(theme: GameTheme, tokens: GameTokens): void;
  /** Only with testHooks. */
  debugTargets?(): DebugTarget[];
  /** Only with testHooks. */
  debugTextures?(): DebugTexture[];
}

/** Synchronous: returns a usable handle right away, while the game is still booting. */
export type MountGame = (container: HTMLElement, config: GameConfig) => GameHandle;

export interface GameModule {
  mountGame: MountGame;
}

export interface ReadyEntry {
  status: "ready";
  meta: GameMeta;
  load: () => Promise<GameModule>;
}

export type RegistryEntry = { status: "coming-soon" } | ReadyEntry;

export type GameRegistry = Record<GameId, RegistryEntry>;
