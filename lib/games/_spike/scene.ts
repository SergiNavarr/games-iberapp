import * as Phaser from "phaser";
import manifest from "./assets.manifest.json";
import { ensurePlaceholders, queueManifest, type ManifestEntry } from "./placeholders";

const ENTRIES = manifest as ManifestEntry[];

export interface SpikeSceneOptions {
  assetBase: string;
  colors: { background: number; mover: number; target: number; targetHit: number; player: number };
  placeholderColor: string;
  reducedMotion: boolean;
  /** True once the handle was destroyed: the scene must not load, start or report anything else. */
  isDestroyed: () => boolean;
  onReady: () => void;
  onTargetHit: () => void;
}

const PLAYER_SPEED = 0.45; // design px per ms
const MOVER_PERIOD = 2400; // ms for a full back-and-forth

// Minimal scene, no text: a background, a rectangle that moves by itself (still with reducedMotion), a tappable target
// that changes color, a rectangle driven by the arrow keys (only while the stage has focus) and the missing image.
export class SpikeScene extends Phaser.Scene {
  private mover!: Phaser.GameObjects.Rectangle;
  private target!: Phaser.GameObjects.Arc;
  private player!: Phaser.GameObjects.Rectangle;
  private missing!: Phaser.GameObjects.Image;
  private keys!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private hit = false;
  private playerAt = { x: 0.3, y: 0.68 }; // relative, so a layout change keeps the player in place

  constructor(private readonly options: SpikeSceneOptions) {
    super({ key: "spike" });
  }

  preload() {
    if (this.options.isDestroyed()) return;
    queueManifest(this.load, this.options.assetBase, ENTRIES);
  }

  create() {
    if (this.options.isDestroyed()) return;
    const { colors, placeholderColor } = this.options;
    ensurePlaceholders(this.textures, ENTRIES, placeholderColor);

    this.cameras.main.setBackgroundColor(colors.background);
    this.mover = this.add.rectangle(0, 0, 160, 48, colors.mover);
    this.player = this.add.rectangle(0, 0, 88, 88, colors.player);
    this.missing = this.add.image(0, 0, "missing");
    this.target = this.add.circle(0, 0, 64, colors.target).setInteractive({ useHandCursor: true });
    this.target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onTargetDown, this);

    // Captured keys only have their default prevented while the stage has focus (the keyboard listens on it).
    const keyboard = this.input.keyboard!;
    const { UP, DOWN, LEFT, RIGHT } = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { up: keyboard.addKey(UP, true), down: keyboard.addKey(DOWN, true), left: keyboard.addKey(LEFT, true), right: keyboard.addKey(RIGHT, true) };

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.detach, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.detach, this);
    this.layout();
    this.options.onReady();
  }

  update(time: number, delta: number) {
    if (!this.player) return;
    const { width, height } = this.scale.gameSize;

    if (!this.options.reducedMotion) {
      const phase = (time % MOVER_PERIOD) / MOVER_PERIOD;
      const sweep = 1 - Math.abs(phase * 2 - 1); // 0 → 1 → 0
      this.mover.x = 120 + sweep * (width - 240);
    }

    const step = PLAYER_SPEED * delta;
    const dx = (this.keys.right.isDown ? step : 0) - (this.keys.left.isDown ? step : 0);
    const dy = (this.keys.down.isDown ? step : 0) - (this.keys.up.isDown ? step : 0);
    if (dx || dy) {
      const half = this.player.width / 2;
      this.player.x = Phaser.Math.Clamp(this.player.x + dx, half, width - half);
      this.player.y = Phaser.Math.Clamp(this.player.y + dy, half, height - half);
      this.playerAt = { x: this.player.x / width, y: this.player.y / height };
    }
  }

  private onTargetDown() {
    if (this.options.isDestroyed()) return;
    this.hit = !this.hit;
    this.target.setFillStyle(this.hit ? this.options.colors.targetHit : this.options.colors.target);
    this.options.onTargetHit();
  }

  /** Positions everything for the current design size (16:9 or 4:5). */
  private layout() {
    const { width, height } = this.scale.gameSize;
    this.missing.setPosition(40 + 64, 40 + 64);
    this.mover.setPosition(this.options.reducedMotion ? width / 2 : 120, height * 0.3);
    this.target.setPosition(width * 0.72, height * 0.68);
    this.player.setPosition(this.playerAt.x * width, this.playerAt.y * height);
  }

  private detach() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
  }
}
