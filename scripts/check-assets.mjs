// JUDGE · C22 (§2.6): the game's asset manifest is faithful.
// Usage: node scripts/check-assets.mjs <gameId> [--approved <artifact index.md>] [--root <repo root>]
//  (a) lib/games/<id>/assets.manifest.json is identical to the approved ```json block of the game's artifact (section
//      "Manifiesto de assets aprobado"), compared as normalized JSON: object keys sorted, array order kept (literal copy).
//  (b) every file in public/games/<id>/ is in the manifest and matches its format, width, height and frames (read from
//      the file header: WebP VP8/VP8L/VP8X, PNG IHDR; a spritesheet is a horizontal strip: count × frameWidth wide).
//  (c) no file left over. Missing files are warnings, not errors (the game draws placeholders).
// maxKB is not checked: C22 does not ask for it. Exit code 0 only without errors.
import fs from "node:fs";
import path from "node:path";

const ARTIFACTS = "C:/Users/nacho/.traycer/epics/fc7fef95-bac1-4ac9-83b8-0ecc35e0bd81/artifacts/minijuegos-phaser-plan";
const APPROVED_BY_GAME = {
  "clean-channels": `${ARTIFACTS}/g1-clean-channels/index.md`,
  "water-signs": `${ARTIFACTS}/g2-water-signs/index.md`,
};

const args = process.argv.slice(2);
const gameId = args.find((a) => !a.startsWith("--"));
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!gameId) {
  console.error("uso: node scripts/check-assets.mjs <gameId> [--approved <index.md>] [--root <dir>]");
  process.exit(2);
}
const root = option("--root") ?? process.cwd();
const approvedPath = option("--approved") ?? APPROVED_BY_GAME[gameId];

const errors = [];
const warnings = [];
const ok = [];

// ---------- (a) manifest vs approved block ----------

function approvedBlock(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const start = text.search(/^##\s+Manifiesto de assets aprobado/m);
  if (start < 0) throw new Error(`no hay sección "Manifiesto de assets aprobado" en ${file}`);
  const fence = text.slice(start).match(/```json\n([\s\S]*?)\n```/);
  if (!fence) throw new Error(`no hay bloque \`\`\`json en la sección aprobada de ${file}`);
  return JSON.parse(fence[1]);
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, normalize(value[k])]));
  return value;
}

const manifestPath = path.join(root, "lib", "games", gameId, "assets.manifest.json");
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  errors.push(`(a) no se pudo leer ${manifestPath}: ${error.message}`);
}
if (manifest) {
  if (!approvedPath) errors.push(`(a) no hay artefacto aprobado conocido para "${gameId}": usar --approved`);
  else {
    try {
      const approved = approvedBlock(approvedPath);
      const a = JSON.stringify(normalize(manifest));
      const b = JSON.stringify(normalize(approved));
      if (a === b) ok.push(`(a) manifiesto idéntico al bloque aprobado (${manifest.length} entradas)`);
      else {
        const keys = (list) => list.map((e) => e.key).join(", ");
        errors.push(`(a) el manifiesto difiere del bloque aprobado de ${approvedPath}`);
        if (manifest.length !== approved.length) errors.push(`    entradas: ${manifest.length} vs ${approved.length} aprobadas`);
        approved.forEach((entry, i) => {
          if (JSON.stringify(normalize(entry)) !== JSON.stringify(normalize(manifest[i] ?? null)))
            errors.push(`    posición ${i}: aprobado ${JSON.stringify(entry)} · manifiesto ${JSON.stringify(manifest[i] ?? null)}`);
        });
        if (keys(manifest) !== keys(approved)) errors.push(`    claves: [${keys(manifest)}] vs aprobadas [${keys(approved)}]`);
      }
    } catch (error) {
      errors.push(`(a) ${error.message}`);
    }
  }
}

// ---------- (b) and (c) files in public/games/<id>/ ----------

/** { format, width, height } from the file header, or null if it is neither WebP nor PNG. */
export function imageInfo(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 16 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buf.length >= 30) return { format: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L" && buf.length >= 25)
      return {
        format: "webp",
        width: 1 + (((buf[22] & 0x3f) << 8) | buf[21]),
        height: 1 + (((buf[24] & 0x0f) << 10) | (buf[23] << 2) | ((buf[22] & 0xc0) >> 6)),
      };
    if (chunk === "VP8X" && buf.length >= 30) return { format: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

const publicDir = path.join(root, "public", "games", gameId);
const files = fs.existsSync(publicDir) ? fs.readdirSync(publicDir).filter((f) => fs.statSync(path.join(publicDir, f)).isFile()) : [];
if (!fs.existsSync(publicDir)) warnings.push(`no existe public/games/${gameId}/: todos los assets faltan (el juego usa placeholders)`);

if (manifest) {
  const byFile = new Map(manifest.map((e) => [e.file, e]));
  for (const file of files) {
    const entry = byFile.get(file);
    if (!entry) {
      errors.push(`(c) public/games/${gameId}/${file} no figura en el manifiesto`);
      continue;
    }
    const info = imageInfo(fs.readFileSync(path.join(publicDir, file)));
    if (!info) {
      errors.push(`(b) ${file}: no es WebP ni PNG legible`);
      continue;
    }
    const problems = [];
    if (info.format !== entry.format) problems.push(`formato ${info.format} ≠ ${entry.format}`);
    if (info.width !== entry.width) problems.push(`ancho ${info.width} ≠ ${entry.width}`);
    if (info.height !== entry.height) problems.push(`alto ${info.height} ≠ ${entry.height}`);
    if (entry.frames) {
      if (entry.frames.count * entry.frames.frameWidth !== info.width) problems.push(`frames: ${entry.frames.count} × ${entry.frames.frameWidth} ≠ ancho ${info.width}`);
      if (entry.frames.frameHeight !== info.height) problems.push(`frames: alto de frame ${entry.frames.frameHeight} ≠ ${info.height}`);
    }
    if (problems.length) errors.push(`(b) ${file}: ${problems.join("; ")}`);
    else ok.push(`(b) ${file}: ${info.format} ${info.width}×${info.height}`);
  }
  for (const entry of manifest) if (!files.includes(entry.file)) warnings.push(`falta ${entry.file} (advertencia: se usa el placeholder)`);
}

for (const line of ok) console.log(`PASA         ${line}`);
for (const line of warnings) console.log(`ADVERTENCIA  ${line}`);
for (const line of errors) console.log(`ERROR        ${line}`);
console.log(errors.length ? `\nC22 · ${errors.length} error(es).` : `\nC22 · sin errores (${warnings.length} advertencia(s)).`);
process.exit(errors.length ? 1 : 0);
