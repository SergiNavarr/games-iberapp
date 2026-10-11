// SPIKE (T2, harness): proves Phaser 3.90 under Turbopack, server prerender and Strict Mode. What works moves to
// lib/games/shared/ in T3. Importing this module has no effects and does not load Phaser: Phaser and the scene live
// in ./game, which is only reached through the import() inside mountSpike.
import type { SpikeGame } from "./game";

export type SpikeRenderer = "WEBGL" | "CANVAS";

/** Colors already resolved by the page (CSS color strings: "#rrggbb" or "rgb(...)"). The canvas cannot read CSS. */
export interface SpikePalette {
  background: string;
  mover: string;
  target: string;
  targetHit: string;
  player: string;
  placeholder: string;
}

export interface SpikeOptions {
  /** Base URL of the game's assets, ending in "/" (e.g. "/games/_spike/"). The only place the loader requests from. */
  assetBase: string;
  palette: SpikePalette;
  reducedMotion: boolean;
  /** Scene ready: assets loaded or replaced by placeholders. At most once, never after destroy(). */
  onReady?: () => void;
  onTargetHit?: () => void;
  /** Phaser chunk failed to load. Never after destroy(). */
  onError?: (error: unknown) => void;
}

export interface SpikeHandle {
  /** Idempotent, safe before Phaser has loaded or booted. */
  destroy(): void;
  renderer(): SpikeRenderer | null;
}

/** Synchronous: returns a usable handle right away while Phaser is still loading. `container` must be sized by CSS. */
export function mountSpike(container: HTMLElement, options: SpikeOptions): SpikeHandle {
  let destroyed = false;
  let game: SpikeGame | null = null;

  import("./game").then(
    ({ createSpikeGame }) => {
      if (!destroyed) game = createSpikeGame(container, options);
    },
    (error: unknown) => {
      if (!destroyed) options.onError?.(error);
    },
  );

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      game?.destroy();
      game = null;
    },
    renderer: () => game?.renderer() ?? null,
  };
}
