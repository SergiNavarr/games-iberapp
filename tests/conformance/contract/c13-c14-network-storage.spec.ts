// JUDGE · C13(b) and C14(b), over one full game of each variant (from the "Empezar" click to `complete`: keyboard;
// run games at ×10, then the review).
// C13(b): every http(s) request outside /_next/ starts with assetBase. C14(b): 0 attribute mutations on <html> and
// <body>; setItem only with key "ibera-games-progress" and only once onComplete fired (checked from the click until
// 1 s after `complete`). C13(a) and C14(a) are in c00-static.spec.ts.
import { expect, fastParams, finishGame, gotoBench, instrumentProbe, readProbe, startGame, test } from "./support";

const PROGRESS_KEY = "ibera-games-progress";

test("C13(b) · los pedidos entre Empezar y onComplete, fuera de /_next/, empiezan con assetBase", async ({ page, variant }) => {
  const requests: string[] = [];
  let recording = false;
  page.on("request", (req) => {
    if (recording) requests.push(req.url());
  });
  await gotoBench(page, variant.id, fastParams(variant));
  recording = true;
  await startGame(page);
  await finishGame(page, variant);
  recording = false;
  const outside = requests.filter((u) => {
    const url = new URL(u);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.pathname.startsWith("/_next/") && !url.pathname.startsWith(variant.assetBase);
  });
  test.info().annotations.push({ type: "info", description: `pedidos http(s) en la partida: ${requests.length}` });
  expect(outside, "pedidos fuera de /_next/ que no empiezan con assetBase").toEqual([]);
});

test("C14(b) · la partida no toca atributos de <html>/<body> y solo persiste después de onComplete", async ({ page, variant }) => {
  await page.addInitScript(instrumentProbe);
  await gotoBench(page, variant.id, fastParams(variant));
  await page.waitForLoadState("networkidle");
  const setItemsBefore = (await readProbe(page)).setItems.length;
  await page.evaluate(() => {
    const w = window as unknown as { __judgeAttrs: string[] };
    w.__judgeAttrs = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) w.__judgeAttrs.push(`${(r.target as Element).tagName.toLowerCase()}[${r.attributeName}]`);
    });
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.body, { attributes: true });
  });
  await startGame(page);
  const log = await finishGame(page, variant);
  const mutations = await page.evaluate(() => (window as unknown as { __judgeAttrs: string[] }).__judgeAttrs);
  const completeIndex = log.findIndex((e) => e.event === "complete");
  await page.waitForTimeout(1_000);

  const setItems = (await readProbe(page)).setItems.slice(setItemsBefore);
  test.info().annotations.push({ type: "info", description: `setItem en la partida: ${JSON.stringify(setItems)}; complete en el índice ${completeIndex}` });
  expect.soft(mutations, "mutaciones de atributos de <html>/<body> durante la partida").toEqual([]);
  expect.soft(setItems.filter((s) => s.key !== PROGRESS_KEY).map((s) => s.key), `setItem con otra clave que ${PROGRESS_KEY}`).toEqual([]);
  expect.soft(setItems.filter((s) => s.key === PROGRESS_KEY && !s.completeLogged).length, `setItem de ${PROGRESS_KEY} antes de onComplete`).toBe(0);
});
