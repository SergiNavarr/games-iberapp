import type * as Phaser from "phaser";

/** One entry of assets.manifest.json (plan §2.7). Sizes are file px = logical design px (density 1). */
export interface ManifestEntry {
  key: string;
  file: string;
  type: "image" | "spritesheet";
  width: number;
  height: number;
  format: "webp" | "png";
  alpha: boolean;
  frames: null | { count: number; frameWidth: number; frameHeight: number; fps: number; loop: boolean };
  maxKB: number;
  placeholder: string;
  use: string;
}

/** Queues every manifest entry, relative to assetBase. Missing files only fail that file; the loader keeps going. */
export function queueManifest(load: Phaser.Loader.LoaderPlugin, assetBase: string, entries: readonly ManifestEntry[]) {
  load.setPath(assetBase);
  for (const entry of entries) {
    if (entry.type === "spritesheet" && entry.frames) {
      const { frameWidth, frameHeight, count } = entry.frames;
      load.spritesheet(entry.key, entry.file, { frameWidth, frameHeight, endFrame: count - 1 });
    } else {
      load.image(entry.key, entry.file);
    }
  }
}

/**
 * After the loader is done, every manifest key that did not load (404, decode error...) gets a texture drawn in code
 * with the same key, size and frames, so the scene never needs to know which assets are real.
 * Frames follow the manifest rule: a horizontal strip, same size, no margin or spacing, named 0..count-1 like
 * Phaser's own spritesheet frames.
 */
export function ensurePlaceholders(textures: Phaser.Textures.TextureManager, entries: readonly ManifestEntry[], color: string) {
  for (const entry of entries) {
    if (textures.exists(entry.key)) continue;
    const texture = textures.createCanvas(entry.key, entry.width, entry.height);
    if (!texture) continue;
    const frames = entry.frames ?? { count: 1, frameWidth: entry.width, frameHeight: entry.height };
    for (let i = 0; i < frames.count; i++) {
      drawPlaceholderFrame(texture.context, i * frames.frameWidth, 0, frames.frameWidth, frames.frameHeight, color, i, frames.count);
      if (entry.frames) texture.add(i, 0, i * frames.frameWidth, 0, frames.frameWidth, frames.frameHeight);
    }
    texture.refresh();
  }
}

/** Tinted box with a cross (no text, ever). Animated strips get a dot that advances one step per frame. */
function drawPlaceholderFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, index: number, count: number) {
  const line = Math.max(2, Math.round(Math.min(w, h) / 32));
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.lineWidth = line;
  ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line);
  ctx.beginPath();
  ctx.moveTo(x + line, y + line);
  ctx.lineTo(x + w - line, y + h - line);
  ctx.moveTo(x + w - line, y + line);
  ctx.lineTo(x + line, y + h - line);
  ctx.stroke();
  if (count > 1) {
    const r = Math.min(w, h) / 10;
    ctx.beginPath();
    ctx.arc(x + r * 2 + ((w - r * 4) * index) / (count - 1), y + h - r * 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
