import * as Phaser from "phaser";
import { prepareManifest, queueManifest } from "@/lib/games/shared/assets";
import { createStepper } from "@/lib/games/shared/clock";
import { gameContext, onPalette } from "@/lib/games/shared/context";
import { motion } from "@/lib/games/shared/motion";
import type { Palette } from "@/lib/games/shared/palette";
import { pointerSteer } from "@/lib/games/shared/steer";
import { buildRun, ITEM_SIZE, LANE, OBSTACLE, OBSTACLE_HALF_WIDTH, PICKUP_HALF_WIDTH, PLAYER, type RunObject, type RunPlan } from "../data";

interface Live {
  plan: RunObject;
  sprite: Phaser.GameObjects.Image | null;
  spawnedAt: number | null;
  resolvedAt: number | null;
  collected: boolean;
}

const STEP_MS = 10;
const SPAWN_Y = -ITEM_SIZE;

// HARNESS (E1): auto-scrolling run. Objects come down the lane and cross the player's line at their planned time; the
// player moves sideways (arrows or pointer). Everything that decides the outcome runs in the fixed-step simulation, so
// the run is the same at any timeScale. Nothing is drawn near meta.backgroundProbe (40, 40): the lane starts at 15 %.
export class DummyRunScene extends Phaser.Scene {
  private plan!: RunPlan;
  private objects: Live[] = [];
  private spawns: { id: string; kind: "item" | "obstacle"; x: number; t: number }[] = [];
  private playerFx: number = PLAYER.startFx;
  private player!: Phaser.GameObjects.Image;
  private lane!: Phaser.GameObjects.Graphics;
  private edges!: Phaser.GameObjects.Graphics;
  private keys!: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private steer!: ReturnType<typeof pointerSteer>;
  private stepper!: ReturnType<typeof createStepper>;
  private move!: ReturnType<typeof motion>;
  private palette!: Palette;
  private collected = 0;
  private ended = false;

  constructor() {
    super({ key: "dummy-run" });
  }

  preload() {
    if (gameContext(this).isOver()) return;
    queueManifest(this);
  }

  create() {
    const context = gameContext(this);
    if (context.isOver()) return;
    prepareManifest(this);
    this.plan = buildRun(context.difficulty, undefined, context.random);
    this.objects = this.plan.objects.map((plan) => ({ plan, sprite: null, spawnedAt: null, resolvedAt: null, collected: false }));
    this.move = motion(this);
    this.stepper = createStepper(this, STEP_MS);
    this.steer = pointerSteer(this);

    this.lane = this.add.graphics();
    this.edges = this.add.graphics();
    this.move.ambient(this.edges, { alpha: 0.35 }, 900); // non-essential pulse (still with reducedMotion)
    this.player = this.add.image(0, 0, "player").setDepth(10);

    const keyboard = this.input.keyboard!;
    const { LEFT, RIGHT } = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { left: keyboard.addKey(LEFT, true), right: keyboard.addKey(RIGHT, true) };

    context.setTargets(() =>
      this.objects
        .filter((o) => o.plan.kind === "item" && o.sprite && o.resolvedAt === null)
        .map((o) => ({ id: o.plan.id, x: o.sprite!.x, y: o.sprite!.y, kind: "item" as const })),
    );
    context.setRun(() => {
      const { width } = this.scale.gameSize;
      return {
        durationMs: this.plan.durationMs,
        ended: this.ended,
        player: { x: this.player.x, y: this.player.y },
        kinematics: { playerSpeed: PLAYER.speed, pickupHalfWidth: PICKUP_HALF_WIDTH, visibleMs: this.plan.visibleMs },
        items: this.objects.map((o) => ({
          id: o.plan.id,
          kind: o.plan.kind,
          type: o.plan.type,
          x: o.plan.fx * width,
          arriveAt: o.plan.arriveAt,
          answer: o.plan.answer,
          collected: o.collected,
          resolvedAt: o.resolvedAt,
        })),
        spawns: this.spawns.map((s) => ({ ...s })),
      };
    });

    onPalette(this, (palette) => {
      this.palette = palette;
      this.cameras.main.setBackgroundColor(palette.bg2.color);
      this.paintLane();
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.paintLane, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.paintLane, this));
    this.paintLane();
    this.render(0);
    context.ready();
  }

  update() {
    if (!this.plan || this.ended || gameContext(this).isOver()) return;
    this.stepper.advance((dt, t) => this.simulate(dt, t));
    this.render(this.stepper.time());
  }

  private simulate(dt: number, t: number) {
    const context = gameContext(this);
    const { width } = this.scale.gameSize;
    const minX = width * LANE.left + PLAYER.width / 2;
    const maxX = width * LANE.right - PLAYER.width / 2;

    // Player: arrows, or toward the pointer while it steers. Speed in design px/s.
    const step = (PLAYER.speed * dt) / 1000;
    let x = this.playerFx * width;
    const target = this.steer.target();
    if (this.keys.left.isDown) x -= step;
    else if (this.keys.right.isDown) x += step;
    else if (target !== null) x += Phaser.Math.Clamp(target - x, -step, step);
    x = Phaser.Math.Clamp(x, minX, maxX);
    this.playerFx = x / width;

    for (const o of this.objects) {
      if (o.spawnedAt === null && t >= o.plan.arriveAt - this.plan.visibleMs) {
        o.spawnedAt = t;
        this.spawns.push({ id: o.plan.id, kind: o.plan.kind, x: o.plan.fx * width, t });
      }
      if (o.spawnedAt !== null && o.resolvedAt === null && t >= o.plan.arriveAt) {
        o.resolvedAt = t;
        const distance = Math.abs(x - o.plan.fx * width);
        if (o.plan.kind === "item") {
          if (distance <= PICKUP_HALF_WIDTH) {
            o.collected = true;
            this.collected += 1;
            context.collect(this.collected, this.plan.objects.filter((p) => p.kind === "item").length);
            context.announce(`Recolectaste un objeto ${o.plan.type === "round" ? "redondo" : "cuadrado"}: ${this.collected} en total.`);
          } else {
            context.announce("Se te pasó un objeto.");
          }
        } else if (distance <= OBSTACLE_HALF_WIDTH) {
          this.move.impact(this.player);
        }
      }
    }

    if (t >= this.plan.durationMs) {
      this.ended = true;
      const collected = this.objects.filter((o) => o.collected).map((o) => ({ id: o.plan.id, type: o.plan.type, answer: o.plan.answer, points: o.plan.points }));
      context.announce("Terminó el recorrido.");
      context.runEnd({ collected });
    }
  }

  /** Draws the simulation state at simulation time `t` (sprites follow their planned arrival). */
  private render(t: number) {
    const { width, height } = this.scale.gameSize;
    const lineY = height - 90;
    const speed = (lineY - SPAWN_Y) / this.plan.visibleMs; // px per game ms, so arrival happens exactly at arriveAt
    this.player.setPosition(this.playerFx * width, lineY);
    for (const o of this.objects) {
      if (o.spawnedAt === null) continue;
      const y = lineY - (o.plan.arriveAt - t) * speed;
      const gone = o.collected || y > height + ITEM_SIZE;
      if (gone) {
        o.sprite?.destroy();
        o.sprite = null;
        continue;
      }
      if (!o.sprite) {
        const key = o.plan.kind === "obstacle" ? "obstacle" : o.plan.type === "round" ? "item-round" : "item-square";
        o.sprite = this.add.image(0, 0, key).setDepth(o.plan.kind === "obstacle" ? 5 : 6);
        if (o.plan.kind === "obstacle") o.sprite.setDisplaySize(OBSTACLE.width, OBSTACLE.height);
      }
      o.sprite.setPosition(o.plan.fx * width, y);
    }
  }

  private paintLane() {
    if (!this.palette || !this.lane) return;
    const { width, height } = this.scale.gameSize;
    const left = width * LANE.left;
    const right = width * LANE.right;
    const { rule, leaf } = this.palette;
    this.lane.clear().fillStyle(rule.color, rule.alpha).fillRect(left, 0, right - left, height);
    this.edges.clear().lineStyle(4, leaf.color, 1).lineBetween(left, 0, left, height).lineBetween(right, 0, right, height);
    if (this.player) this.render(this.stepper.time());
  }
}
