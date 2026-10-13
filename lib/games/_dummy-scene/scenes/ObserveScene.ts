import * as Phaser from "phaser";
import { prepareManifest, queueManifest } from "@/lib/games/shared/assets";
import { gameContext, onPalette } from "@/lib/games/shared/context";
import { crosshair } from "@/lib/games/shared/crosshair";
import { onKeyDown } from "@/lib/games/shared/keys";
import { layoutFor } from "@/lib/games/shared/layout";
import { motion } from "@/lib/games/shared/motion";
import type { Palette } from "@/lib/games/shared/palette";
import { fitScene, toDesign, toScene, type SceneFit } from "@/lib/games/shared/scene-fit";
import { CROSSHAIR, DEFAULT_DIFFICULTY, FRAME, MARKER_APPEAR_MS, marksFor, SCENE, TAP_SLOP, TOTAL, ZONES, zoneAt, type SceneSummary, type Zone } from "../data";

// HARNESS (E2): a fixed scene with zones to mark. Everything lives in one container in scene px; only the container
// moves when the layout changes (16:9: ×0.8 between bg2 bands; 4:5: inside a bg2 frame of FRAME px). Marking: Enter
// or Space at the keyboard crosshair, or a tap/click released where it went down. A zone spends a mark; a signal also
// scores. Empty scene and marked zones do nothing at all. The phase ends when the marks run out or every item is
// found. Nothing moves without input: the only motion is a marker's entrance (motion.appear).
export class ObserveScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private zones!: Phaser.GameObjects.Graphics;
  private cross!: ReturnType<typeof crosshair>;
  private move!: ReturnType<typeof motion>;
  private fit: SceneFit = { x: 0, y: 0, scale: 1 };
  private palette!: Palette;
  private marks = 0;
  private marked: Zone[] = [];
  private hits = 0;
  private score = 0;
  private ended = false;

  constructor() {
    super({ key: "observe" });
  }

  preload() {
    if (gameContext(this).isOver()) return;
    queueManifest(this);
  }

  create() {
    const context = gameContext(this);
    if (context.isOver()) return;
    prepareManifest(this);
    this.move = motion(this);
    this.marks = marksFor(context.difficulty);

    this.world = this.add.container(0, 0);
    this.zones = this.add.graphics();
    this.cross = crosshair(this, CROSSHAIR, SCENE);
    this.world.add([this.add.image(0, 0, "scene").setOrigin(0), this.zones, this.cross.graphics]);

    const keyboard = this.input.keyboard!;
    for (const code of [Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.SPACE]) {
      onKeyDown(keyboard.addKey(code, true), () => {
        const { x, y } = this.cross.position();
        this.markAt(x, y);
      });
    }
    // On release, and only if the pointer stayed put: a swipe that scrolls the page never marks (C12).
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY) > TAP_SLOP) return;
      const { x, y } = toScene(this.fit, pointer.upX, pointer.upY);
      this.markAt(x, y);
    });

    context.setTargets(() =>
      // debugTargets() kind: a signal is an "item" (as in run games), a decoy stays "decoy".
      ZONES.filter((z) => !this.isMarked(z)).map((z) => ({ id: z.id, ...toDesign(this.fit, z.x, z.y), kind: z.kind === "signal" ? ("item" as const) : ("decoy" as const) })),
    );
    context.setScene(() => ({
      fit: { ...this.fit },
      size: { ...SCENE },
      marks: this.marks,
      marksLeft: this.marksLeft(),
      hits: this.hits,
      score: this.score,
      crosshair: { ...this.cross.position(), step: CROSSHAIR.step },
      zones: ZONES.map((z) => ({ id: z.id, kind: z.kind, x: z.x, y: z.y, r: z.r, marked: this.isMarked(z) })),
      ended: this.ended,
    }));

    onPalette(this, (palette) => {
      this.palette = palette;
      this.cameras.main.setBackgroundColor(palette.bg2.color);
      this.paintZones();
      this.cross.paint(palette);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));
    this.layout();
    context.counter(this.marks, this.marks);
    context.ready();
  }

  update() {
    if (!this.cross || this.ended) return;
    this.cross.update();
  }

  private marksLeft() {
    return this.marks - this.marked.length;
  }

  private isMarked(zone: Zone) {
    return this.marked.includes(zone);
  }

  private markAt(x: number, y: number) {
    const context = gameContext(this);
    if (this.ended || context.isOver()) return;
    const zone = zoneAt(x, y);
    if (!zone || this.isMarked(zone)) return;

    this.marked.push(zone);
    if (zone.kind === "signal") {
      this.hits += 1;
      this.score += zone.points;
      context.progress(this.hits, TOTAL);
    }
    const marker = this.add.image(zone.x, zone.y, zone.kind === "signal" ? "marker-hit" : "marker-miss");
    this.world.addAt(marker, this.world.getIndex(this.cross.graphics)); // under the crosshair
    this.move.appear(marker, MARKER_APPEAR_MS);

    const left = this.marksLeft();
    context.counter(left, this.marks);
    const done = left === 0 || this.hits === TOTAL;
    const what = zone.kind === "signal" ? `Señal ${zone.id.slice(-1)}: suma ${zone.points} puntos.` : "Señuelo: no suma.";
    const rest =
      this.hits === TOTAL ? " Encontraste todas las señales." : left === 0 ? " No te quedan marcas." : left === 1 ? " Te queda 1 marca." : left === 2 ? " Te quedan 2 marcas." : "";
    context.announce(what + rest); // one announcement per mark: the panel shows only the last one
    if (!done) return;

    this.ended = true;
    const summary: SceneSummary = {
      difficulty: context.difficulty ?? DEFAULT_DIFFICULTY,
      marks: this.marks,
      found: this.marked.filter((z) => z.kind === "signal").map((z) => z.id),
      decoys: this.marked.filter((z) => z.kind === "decoy").map((z) => z.id),
      hits: this.hits,
      total: TOTAL,
      score: this.score,
    };
    context.runEnd(summary);
  }

  private layout() {
    const { width, height } = this.scale.gameSize;
    this.fit = fitScene(width, height, SCENE.width, SCENE.height, layoutFor(width, height) === "portrait" ? FRAME : 0);
    this.world.setPosition(this.fit.x, this.fit.y).setScale(this.fit.scale);
  }

  /** Zone outlines (the dummy has no art): theme colors, repainted on setTheme. */
  private paintZones() {
    if (!this.palette) return;
    const { mute } = this.palette;
    this.zones.clear().lineStyle(3, mute.color, 0.8);
    for (const z of ZONES) this.zones.strokeCircle(z.x, z.y, z.r);
  }
}
