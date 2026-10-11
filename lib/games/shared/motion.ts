import type * as Phaser from "phaser";
import { gameContext } from "./context";

type Targets = object | object[];

interface TweenOptions {
  duration: number;
  ease?: string;
  delay?: number;
  onComplete?: () => void;
}

/**
 * The only way a game moves things that are not essential to play (plan §2.2): tweens, ambient loops, sprite
 * animations and camera effects. With reducedMotion everything is still: tweens jump to their end values, loops and
 * camera effects do nothing and animated sprites rest on frame 0. The canvas does not inherit the CSS rule.
 */
export function motion(scene: Phaser.Scene) {
  const reduced = gameContext(scene).reducedMotion;
  return {
    reduced,

    /** Animates numeric properties to `to`. Reduced: sets them at once and calls onComplete. */
    tween(targets: Targets, to: Record<string, number>, options: TweenOptions) {
      if (reduced) {
        for (const target of ([] as object[]).concat(targets)) Object.assign(target, to);
        options.onComplete?.();
        return null;
      }
      return scene.tweens.add({ targets, ...to, duration: options.duration, ease: options.ease ?? "Sine.easeInOut", delay: options.delay ?? 0, onComplete: options.onComplete });
    },

    /** Endless back-and-forth decoration (yoyo). Reduced: nothing moves. */
    ambient(targets: Targets, to: Record<string, number>, duration: number) {
      if (reduced) return null;
      return scene.tweens.add({ targets, ...to, duration, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
    },

    /** Plays a manifest animation (shared/assets.ts creates one per spritesheet). Reduced: frame 0, still. */
    play(sprite: Phaser.GameObjects.Sprite, animation: string) {
      if (reduced) sprite.setFrame(0);
      else sprite.play(animation);
      return sprite;
    },

    /** Camera shake as feedback. Reduced: nothing. */
    shake(duration = 120, intensity = 0.004) {
      if (!reduced) scene.cameras.main.shake(duration, intensity);
    },
  };
}
