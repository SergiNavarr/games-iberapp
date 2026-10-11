// JUDGE · S9 = C02 adapted to the spike, on `next start` (project "start"): loading /spike without calling mount() (and
// without scrolling), no JS response contains "3.90.0" together with "Phaser"; after mount(), some response does.
// "Together" = both strings in the same response body: in Phaser's minified build the literal "3.90.0" only appears in
// the VERSION constant, with no "Phaser" next to it, so a proximity reading could never match.
import { expect, test, type Response } from "@playwright/test";
import { gotoSpike, mountAndWaitReady } from "./support";

type JsBody = { url: string; phase: "load" | "mount"; hasPhaser: boolean };

function isJs(res: Response): boolean {
  return res.request().resourceType() === "script" || (res.headers()["content-type"] ?? "").includes("javascript");
}

test("S9 · Phaser fuera del bundle inicial (next start)", async ({ page }) => {
  let phase: JsBody["phase"] = "load";
  const bodies: JsBody[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (res) => {
    if (!isJs(res)) return;
    const at = phase;
    pending.push(
      res
        .text()
        .then((body) => {
          bodies.push({ url: res.url(), phase: at, hasPhaser: body.includes("3.90.0") && body.includes("Phaser") });
        })
        .catch(() => undefined),
    );
  });

  await gotoSpike(page);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2_000);
  await Promise.all(pending);
  const onLoad = bodies.filter((b) => b.phase === "load");
  test.info().annotations.push({ type: "info", description: `respuestas JS al cargar: ${onLoad.length}` });
  expect(onLoad.length, "[control] no se registró ninguna respuesta JS al cargar /spike").toBeGreaterThan(0);
  expect.soft(onLoad.filter((b) => b.hasPhaser).map((b) => b.url), "respuestas JS con Phaser antes de mount()").toEqual([]);

  phase = "mount";
  await mountAndWaitReady(page, 30_000);
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);
  const withPhaser = bodies.filter((b) => b.phase === "mount" && b.hasPhaser).map((b) => b.url);
  test.info().annotations.push({ type: "info", description: `respuestas JS con Phaser después de mount(): ${withPhaser.join(", ") || "(ninguna)"}` });
  expect.soft(withPhaser.length, "respuestas JS con Phaser después de mount()").toBeGreaterThan(0);
});
