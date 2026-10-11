import type * as Phaser from "phaser";
import type { DebugTexture } from "@/lib/games/contract";
import type { ManifestEntry } from "./assets";
import type { Palette } from "./palette";

const CONTEXT_KEY = "ibera:context";
export const PALETTE_KEY = "ibera:palette";

/** A tappable target as the scene knows it: world (design) px. */
export interface SceneTarget {
  id: string;
  x: number;
  y: number;
}

/**
 * What a game's scenes get from the runtime (shared/runtime.ts). The scenes never see the GameConfig callbacks:
 * these wrappers enforce the contract invariants (once, never after destroy, no input after complete).
 */
export interface GameContext {
  readonly assetBase: string;
  readonly reducedMotion: boolean;
  readonly total: number;
  readonly manifest: readonly ManifestEntry[];
  /** Seeded when the config has a seed. Use it for anything random in the mechanic. */
  readonly random: () => number;
  palette(): Palette;
  /** Assets ready (or replaced): reports onReady, once. */
  ready(): void;
  /** Reports onProgress when `hits` changed. */
  progress(hits: number): void;
  announce(text: string): void;
  /** Reports onComplete once (total filled in) and stops all input. */
  complete(completed: boolean, hits: number): void;
  fail(error: unknown): void;
  /** True after complete() or destroy(): ignore input. */
  isOver(): boolean;
  /** For handle.debugTargets(): the scene's current tappable targets. */
  setTargets(provider: (() => SceneTarget[]) | null): void;
  /** Filled by prepareManifest() (assets.ts). */
  textureSources: Map<string, DebugTexture["source"]>;
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
