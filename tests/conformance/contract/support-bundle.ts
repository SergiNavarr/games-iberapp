// JUDGE: records JS response bodies and flags the ones carrying Phaser ("3.90.0" and "Phaser" in the same body, the
// reading confirmed for S9/C02: in Phaser's minified build the version literal has no "Phaser" next to it).
import type { Page, Response } from "@playwright/test";

export type JsBody = { url: string; phase: string; hasPhaser: boolean };

function isJs(res: Response): boolean {
  return res.request().resourceType() === "script" || (res.headers()["content-type"] ?? "").includes("javascript");
}

export function watchJsBodies(page: Page) {
  const bodies: JsBody[] = [];
  const pending: Promise<void>[] = [];
  const state = {
    phase: "load",
    /** Waits for every body read so far and returns the ones recorded in `phase`. */
    async settle(phase: string) {
      await Promise.all(pending);
      return bodies.filter((b) => b.phase === phase);
    },
  };
  page.on("response", (res) => {
    if (!isJs(res)) return;
    const at = state.phase;
    pending.push(
      res
        .text()
        .then((body) => {
          bodies.push({ url: res.url(), phase: at, hasPhaser: body.includes("3.90.0") && body.includes("Phaser") });
        })
        .catch(() => undefined),
    );
  });
  return state;
}
