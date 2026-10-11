// JUDGE · static items of §2.6 (W) against the `_dummy` variants: C03(a), C04, C09(a), C13(a), C14(a), C15, C17(a),
// C20(a). Each search is the literal `rg` pattern of the checklist, applied to "carpetas del juego" = lib/games/_dummy/,
// lib/games/_dummy-run/ and lib/games/shared/ (C20 a: outside shared/). Comments count, as with rg; C14(a) uses word
// boundaries (\b), per the corrected wording. Runs once (in the `_dummy` project): it covers both variants.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { grepDir, type GrepHit } from "../spike/support";
import { DUMMY_VARIANT, expect, RUN_VARIANT, SHARED_DIR, test } from "./support";

const VARIANT_DIRS = [DUMMY_VARIANT.dir, RUN_VARIANT.dir];
const GAME_DIRS = [...VARIANT_DIRS, SHARED_DIR];

test.skip(({ variant }) => variant.run, "las búsquedas estáticas cubren las dos variantes desde el proyecto de _dummy");
const grepGame = (pattern: RegExp) => GAME_DIRS.flatMap((d) => grepDir(d, pattern));

function grepFiles(files: string[], pattern: RegExp): GrepHit[] {
  return files.flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .flatMap((text, i) => (pattern.test(text) ? [{ file, line: i + 1, text: text.trim() }] : [])),
  );
}

test('C03(a) · rg "from \\"phaser\\"" en lib/games/*/meta.ts, registry.ts y contract.ts → 0', () => {
  const metas = fs
    .readdirSync("lib/games", { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join("lib/games", d.name, "meta.ts")))
    .map((d) => `lib/games/${d.name}/meta.ts`);
  for (const dir of VARIANT_DIRS) expect(metas, `[control] falta ${dir}/meta.ts`).toContain(`${dir}/meta.ts`);
  expect(grepFiles([...metas, "lib/games/registry.ts", "lib/games/contract.ts"], /from "phaser"/)).toEqual([]);
});

test("C04 · Phaser exacto (igual que S1)", () => {
  let out = "";
  let code = 0;
  try {
    out = execSync("npm ls phaser", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const e = error as { stdout?: string; status?: number };
    out = e.stdout ?? "";
    code = e.status ?? 1;
  }
  const versions = [...out.matchAll(/phaser@(\S+)/g)].map((m) => m[1]);
  expect.soft(code, "npm ls phaser: código de salida").toBe(0);
  expect.soft(versions.length > 0 && versions.every((v) => v === "3.90.0") && !/invalid|extraneous|missing|UNMET/i.test(out), out).toBe(true);
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as Record<string, Record<string, string> | undefined>;
  expect.soft(pkg.dependencies?.phaser ?? pkg.devDependencies?.phaser, 'package.json: "phaser"').toBe("3.90.0");
});

test('C09(a) · rg "addCapture|addKeys\\(.*true" en carpetas del juego → 0', () => {
  expect(grepGame(/addCapture|addKeys\(.*true/)).toEqual([]);
});

test('C13(a) · rg "fetch\\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource" en carpetas del juego → 0', () => {
  expect(grepGame(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/)).toEqual([]);
});

test('C14(a) · rg "\\bdocument\\.|\\blocalStorage|\\bsessionStorage|\\bindexedDB|\\blocation\\.|\\bhistory\\.|\\bscrollTo|\\bscrollIntoView" en carpetas del juego → 0', () => {
  expect(grepGame(/\bdocument\.|\blocalStorage|\bsessionStorage|\bindexedDB|\blocation\.|\bhistory\.|\bscrollTo|\bscrollIntoView/)).toEqual([]);
});

test('C15 · rg "add\\.text|bitmapText|BitmapText|GameObjects\\.Text" en carpetas del juego → 0', () => {
  expect(grepGame(/add\.text|bitmapText|BitmapText|GameObjects\.Text/)).toEqual([]);
});

test('C17(a) · rg "innerWidth|innerHeight|screen\\.|devicePixelRatio" en carpetas del juego → 0', () => {
  expect(grepGame(/innerWidth|innerHeight|screen\.|devicePixelRatio/)).toEqual([]);
});

test('C20(a) · rg "tweens\\.add|cameras\\.main\\.(shake|flash|fade|pan|zoomTo)" fuera de lib/games/shared/ → 0', () => {
  expect(VARIANT_DIRS.flatMap((d) => grepDir(d, /tweens\.add|cameras\.main\.(shake|flash|fade|pan|zoomTo)/))).toEqual([]);
});
