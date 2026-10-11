import * as Phaser from "phaser";
import { prepareManifest, queueManifest } from "@/lib/games/shared/assets";
import { gameContext, onPalette } from "@/lib/games/shared/context";
import { motion } from "@/lib/games/shared/motion";
import type { Palette } from "@/lib/games/shared/palette";

interface Target {
  id: string;
  /** Relative position (0..1), so the 16:9 / 4:5 switch keeps the layout. */
  rx: number;
  ry: number;
  image: Phaser.GameObjects.Image;
  hit: boolean;
}

const RADIUS = 64; // the "target" manifest entry is 128 × 128

/** Three relative positions, apart from each other, from the seeded random (left to right for the keyboard). */
function placeTargets(random: () => number) {
  const spots: { rx: number; ry: number }[] = [];
  while (spots.length < 3) {
    const spot = { rx: 0.2 + random() * 0.6, ry: 0.3 + random() * 0.38 };
    if (spots.every((s) => Math.hypot(s.rx - spot.rx, (s.ry - spot.ry) * 0.8) > 0.22)) spots.push(spot);
  }
  return spots.sort((a, b) => a.rx - b.rx);
}

// HARNESS (T4): three targets; tap or click one to hit it. Keyboard: arrows choose, Enter or Space hits.
// Ambient: a ripple animation and a slow fade, both still with reducedMotion. Nothing is ever drawn near
// meta.backgroundProbe (40, 40): targets and their ring stay right of x = 68 and below y = 140 in both layouts.
export class DummyScene extends Phaser.Scene {
  private targets: Target[] = [];
  private selected = 0;
  private hits = 0;
  private ring!: Phaser.GameObjects.Graphics;
  private band!: Phaser.GameObjects.Graphics;
  private markers!: Phaser.GameObjects.Graphics;
  private ripple!: Phaser.GameObjects.Sprite;
  private palette!: Palette;

  constructor() {
    super({ key: "dummy" });
  }

  preload() {
    if (gameContext(this).isOver()) return;
    queueManifest(this);
  }

  create() {
    const context = gameContext(this);
    if (context.isOver()) return;
    prepareManifest(this);
    const move = motion(this);

    this.band = this.add.graphics();
    this.ripple = move.play(this.add.sprite(0, 0, "ripple", 0), "ripple");
    move.ambient(this.ripple, { alpha: 0.55 }, 2200);
    this.markers = this.add.graphics();
    this.targets = placeTargets(context.random).map((spot, i) => {
      const image = this.add.image(0, 0, "target").setInteractive({ useHandCursor: true });
      image.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.hit(i));
      return { id: `target-${i + 1}`, ...spot, image, hit: false };
    });
    this.ring = this.add.graphics();

    const keyboard = this.input.keyboard!;
    const { LEFT, RIGHT, UP, DOWN, ENTER, SPACE } = Phaser.Input.Keyboard.KeyCodes;
    for (const [code, step] of [[LEFT, -1], [UP, -1], [RIGHT, 1], [DOWN, 1]] as const) keyboard.addKey(code, true).on("down", () => this.select(step));
    for (const code of [ENTER, SPACE]) keyboard.addKey(code, true).on("down", () => this.hit(this.selected));

    context.setTargets(() => this.targets.filter((t) => !t.hit).map((t) => ({ id: t.id, x: t.image.x, y: t.image.y })));
    onPalette(this, (palette) => {
      this.palette = palette;
      this.cameras.main.setBackgroundColor(palette.bg2.color);
      this.paint();
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));
    this.layout();
    context.ready();
  }

  private select(step: number) {
    const context = gameContext(this);
    if (context.isOver()) return;
    const remaining = this.targets.map((t, i) => (t.hit ? -1 : i)).filter((i) => i >= 0);
    const at = remaining.indexOf(this.selected);
    this.selected = remaining[(at + step + remaining.length) % remaining.length];
    this.paint();
    context.announce(`Objetivo ${this.selected + 1} seleccionado.`);
  }

  private hit(index: number) {
    const context = gameContext(this);
    const target = this.targets[index];
    if (context.isOver() || !target || target.hit) return;
    target.hit = true;
    target.image.disableInteractive().setVisible(false);
    this.hits += 1;
    const next = this.targets.findIndex((t) => !t.hit);
    if (next >= 0) this.selected = next;
    this.paint();
    context.progress(this.hits);
    context.announce(`Objetivo alcanzado: ${this.hits} de ${context.total}.`);
    if (this.hits === context.total) {
      context.announce("¡Listo! Tocaste los tres objetivos.");
      context.complete(true, this.hits);
    }
  }

  private layout() {
    const { width, height } = this.scale.gameSize;
    for (const t of this.targets) t.image.setPosition(t.rx * width, t.ry * height);
    this.ripple.setPosition(width - 96, height - 72);
    this.paint();
  }

  /** Everything theme-dependent. Static: the selection ring does not pulse, so reducedMotion frames stay identical. */
  private paint() {
    if (!this.palette || !this.ring) return;
    const { width, height } = this.scale.gameSize;
    const { rule, head, mint } = this.palette;
    this.band.clear().fillStyle(rule.color, rule.alpha).fillRect(0, height * 0.82, width, height * 0.18);
    this.markers.clear().fillStyle(mint.color, 1);
    for (const t of this.targets) if (t.hit) this.markers.fillCircle(t.image.x, t.image.y, RADIUS * 0.35);
    this.ring.clear();
    const current = this.targets[this.selected];
    if (current && !current.hit && !gameContext(this).isOver()) this.ring.lineStyle(6, head.color, 1).strokeCircle(current.image.x, current.image.y, RADIUS + 12);
  }
}
