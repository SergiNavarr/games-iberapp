// JUDGE · C31 (the ONCE_VARIANT start project, next start): for dark-sky and night-voices, the "Próximamente" state is
// visible (text and an illustration with size > 0), with no canvas (whole document), no role="alert" (inside the
// GameStage root) and no Phaser chunk requested. The stage is scrolled into view first, so the 600 px preload would
// have fired if the wrapper tried it.
import { expect, GAME_ROOT, gotoBench, ONCE_VARIANT, test } from "./support";
import { watchJsBodies } from "./support-bundle";

const COMING_SOON_ART = '[data-testid="coming-soon-art"]';

test.skip(({ variant }) => variant.id !== ONCE_VARIANT.id, `no depende de la variante: corre una vez, en el proyecto de ${ONCE_VARIANT.id}`);

for (const gameId of ["dark-sky", "night-voices"]) {
  test(`C31 · "Próximamente" en ${gameId}`, async ({ page }) => {
    const js = watchJsBodies(page);
    await gotoBench(page, gameId, {});
    await page.waitForLoadState("networkidle");
    await page.locator(GAME_ROOT).scrollIntoViewIfNeeded();
    await page.waitForTimeout(2_000);

    const root = page.locator(GAME_ROOT);
    expect.soft(await root.getAttribute("data-state"), "data-state").toBe("coming-soon");
    await expect.soft(root.getByText("Próximamente", { exact: false }).first(), 'texto "Próximamente" visible').toBeVisible();
    const art = await root.locator(COMING_SOON_ART).first().boundingBox();
    expect.soft(art && art.width > 0 && art.height > 0, `ilustración ${COMING_SOON_ART} con tamaño > 0: ${JSON.stringify(art)}`).toBe(true);
    expect.soft(await page.locator("canvas").count(), "canvas en el documento").toBe(0);
    // Inside the GameStage root only (corrected wording): Next's <next-route-announcer> carries role="alert" on every page.
    const alerts = page.locator(`${GAME_ROOT}[role="alert"], ${GAME_ROOT} [role="alert"]`);
    expect.soft(await alerts.count(), 'elementos role="alert" en el GameStage (raíz incluida)').toBe(0);
    const withPhaser = (await js.settle("load")).filter((b) => b.hasPhaser).map((b) => b.url);
    expect.soft(withPhaser, "respuestas JS con Phaser").toEqual([]);
  });
}
