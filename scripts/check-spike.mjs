// JUDGE: browserless checks of T2 (spike). S1 (exact Phaser) and S10 (report with the 5 sections).
// Usage: node scripts/check-spike.mjs [--informe <path to informe/index.md>]
// Exit code 0 only if every check passes. S2 is run directly: `npm run lint` and `npm run build`.
import { execSync } from "node:child_process";
import fs from "node:fs";

const DEFAULT_INFORME =
  "C:/Users/nacho/.traycer/epics/fc7fef95-bac1-4ac9-83b8-0ecc35e0bd81/artifacts/minijuegos-phaser-plan/t2-spike/informe/index.md";
const argIndex = process.argv.indexOf("--informe");
const informePath = argIndex > 0 ? process.argv[argIndex + 1] : DEFAULT_INFORME;

const results = [];
const report = (id, ok, detail) => results.push({ id, ok, detail });

// ---------- S1: `npm ls phaser` → phaser@3.90.0; package.json "phaser": "3.90.0" without ^ or ~ ----------
{
  let out = "";
  let code = 0;
  try {
    out = execSync("npm ls phaser", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    code = error.status ?? 1;
  }
  const versions = [...out.matchAll(/phaser@(\S+)/g)].map((m) => m[1]);
  const flagged = /invalid|extraneous|missing|UNMET/i.test(out);
  const lsOk = code === 0 && versions.length > 0 && versions.every((v) => v === "3.90.0") && !flagged;
  report("S1 · npm ls phaser", lsOk, `exit ${code}; versiones: ${versions.join(", ") || "(ninguna)"}${flagged ? "; marcas de error en la salida" : ""}`);

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].filter((s) => pkg[s]?.phaser !== undefined);
  const declared = sections.map((s) => `${s}: "${pkg[s].phaser}"`);
  const pkgOk = sections.length > 0 && sections.every((s) => pkg[s].phaser === "3.90.0");
  report("S1 · package.json", pkgOk, declared.join("; ") || 'no declara "phaser"');
}

// ---------- S10: the report exists with exactly the 5 sections of the ticket ----------
{
  const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Keywords per section (accent- and case-insensitive), in the ticket's order. Each inner array is "any of".
  const EXPECTED = [
    { name: "1 · config base: input, escala, renderer", all: [["input", "teclado"], ["escala", "scale"], ["renderer"]] },
    { name: "2 · resolución lógica 16:9 y 4:5 y densidad de píxeles", all: [["16:9"], ["4:5"], ["densidad", "pixel", "devicepixelratio", "dpr"]] },
    { name: "3 · placeholders ante assets faltantes", all: [["placeholder"]] },
    { name: "4 · fin del boot y destroy antes del boot", all: [["boot"], ["destroy"]] },
    { name: "5 · problemas con Turbopack o Strict Mode", all: [["turbopack", "strict mode"]] },
  ];
  if (!fs.existsSync(informePath)) {
    report("S10 · informe", false, `no existe ${informePath}`);
  } else {
    const raw = fs.readFileSync(informePath, "utf8").replace(/\r\n/g, "\n");
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    const kind = fm?.[1].match(/^kind:\s*"?([\w-]+)"?\s*$/m)?.[1] ?? null;
    report("S10 · kind: spec", kind === "spec", `kind: ${kind ?? "(sin frontmatter)"}`);

    const body = fm ? raw.slice(fm[0].length) : raw;
    const lines = [];
    let inFence = false;
    for (const line of body.split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      lines.push(inFence ? "" : line);
    }
    const level = lines.some((l) => /^## (?!#)/.test(l)) ? 2 : 1;
    const headingRe = level === 2 ? /^## (?!#)/ : /^# (?!#)/;
    const sections = [];
    for (const line of lines) {
      if (headingRe.test(line)) sections.push({ heading: line.replace(/^#+\s*/, ""), text: line });
      else if (sections.length > 0) sections[sections.length - 1].text += `\n${line}`;
    }
    report(
      "S10 · exactamente 5 secciones",
      sections.length === 5,
      `${sections.length} secciones de nivel ${level}: ${sections.map((s) => `"${s.heading}"`).join(", ")}`,
    );
    EXPECTED.forEach((exp, i) => {
      const section = sections[i];
      if (!section) return report(`S10 · sección ${exp.name}`, false, "no existe");
      const text = normalize(section.text);
      const missing = exp.all.filter((anyOf) => !anyOf.some((k) => text.includes(normalize(k))));
      report(`S10 · sección ${exp.name}`, missing.length === 0, `"${section.heading}"${missing.length ? `; no menciona: ${missing.map((a) => a.join("/")).join(", ")}` : ""}`);
    });
  }
}

for (const r of results) console.log(`${r.ok ? "PASA " : "FALLA"}  ${r.id}  —  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} verificación(es) fallaron.` : "\nTodas las verificaciones pasaron.");
process.exit(failed ? 1 : 0);
