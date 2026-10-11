import * as Phaser from "phaser";
import { createBaseConfig } from "./config";
import { DESIGN_SIZES, layoutFor } from "./layout";
import { SpikeScene } from "./scene";
import type { SpikeOptions, SpikeRenderer } from "./index";

export interface SpikeGame {
  destroy(): void;
  renderer(): SpikeRenderer | null;
}

const toColor = (css: string) => Phaser.Display.Color.ValueToColor(css).color;

// Owns one Phaser.Game and everything Phaser does not clean up by itself. Reached only through import() (index.ts).
export function createSpikeGame(container: HTMLElement, options: SpikeOptions): SpikeGame {
  let destroyed = false;
  const isDestroyed = () => destroyed;
  const { palette } = options;
  const size = DESIGN_SIZES[layoutFor(container.clientWidth, container.clientHeight)];

  const scene = new SpikeScene({
    assetBase: options.assetBase,
    colors: {
      background: toColor(palette.background),
      mover: toColor(palette.mover),
      target: toColor(palette.target),
      targetHit: toColor(palette.targetHit),
      player: toColor(palette.player),
    },
    placeholderColor: palette.placeholder,
    reducedMotion: options.reducedMotion,
    isDestroyed,
    onReady: () => {
      if (!destroyed) options.onReady?.();
    },
    onTargetHit: () => {
      if (!destroyed) options.onTargetHit?.();
    },
  });

  // Boot is synchronous here (the DOM is ready): the renderer exists and the canvas is in the container on return.
  const game = new Phaser.Game({ ...createBaseConfig(container, size.width, size.height, toColor(palette.background)), scene });

  // Size follows the container, not the window. Phaser only polls its parent every 500 ms; a ResizeObserver reacts on
  // the next frame and also switches the design layout when the section flips between 16:9 and 4:5.
  const resize = new ResizeObserver(() => {
    if (destroyed) return;
    const next = DESIGN_SIZES[layoutFor(container.clientWidth, container.clientHeight)];
    const { gameSize } = game.scale;
    if (next.width !== gameSize.width || next.height !== gameSize.height) game.scale.setGameSize(next.width, next.height);
    game.scale.getParentBounds();
    game.scale.refresh();
  });
  resize.observe(container);

  // A key held while focus leaves the stage never gets its keyup here: release everything.
  const onFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
    for (const active of game.scene.getScenes(true)) active.input.keyboard?.resetKeys();
  };
  container.addEventListener("focusout", onFocusOut);

  // Touch capture is off (so swipes scroll the page), which lets the browser follow a tap with emulated mouse events:
  // Phaser would see the same tap twice (touch pointer, then mouse pointer). Cancelling touchend drops those emulated
  // events and does not block scrolling (touchend of a scroll is not cancelable).
  const canvas = game.canvas;
  const onTouchEnd = (event: TouchEvent) => {
    if (event.cancelable) event.preventDefault();
  };
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resize.disconnect();
      container.removeEventListener("focusout", onFocusOut);
      canvas.removeEventListener("touchend", onTouchEnd);

      // Phaser does not release the WebGL context: without this, about 16 mounts later Chrome drops the oldest one
      // with a console warning. Lose it once Phaser has finished its own GL cleanup (after runDestroy returns).
      const gl = game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? game.renderer.gl : null;
      game.events.once(Phaser.Core.Events.DESTROY, () => queueMicrotask(() => gl?.getExtension("WEBGL_lose_context")?.loseContext()));

      // Phaser destroys on its next step. Before the first step (boot still waiting for its textures) that happens as
      // soon as it starts; the scene is guarded by isDestroyed so it neither loads nor reports. Take the canvas out now
      // so nothing stays visible meanwhile, and wake a sleeping loop so the pending destroy actually runs.
      game.destroy(true);
      canvas.remove();
      if (game.isRunning && !game.loop.running) game.loop.wake();
    },
    renderer() {
      if (destroyed || !game.renderer) return null;
      return game.renderer.type === Phaser.WEBGL ? "WEBGL" : "CANVAS";
    },
  };
}
