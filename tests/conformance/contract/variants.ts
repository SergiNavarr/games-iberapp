// JUDGE: the `_dummy` variants the W suite runs against (E1). No Playwright imports here, so the Playwright config can
// import it too. `run`: the game has a run phase + review (ReadyEntry.review).
export type Variant = { id: string; dir: string; assetBase: string; run: boolean };

export const DUMMY_VARIANT: Variant = { id: "_dummy", dir: "lib/games/_dummy", assetBase: "/games/_dummy/", run: false };
export const RUN_VARIANT: Variant = { id: "_dummy-run", dir: "lib/games/_dummy-run", assetBase: "/games/_dummy-run/", run: true };
