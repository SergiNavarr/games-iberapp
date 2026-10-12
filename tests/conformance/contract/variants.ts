// JUDGE: the games the W/J suite runs against: the two `_dummy` variants (E1) and the real games (G1+). No Playwright
// imports here, so the Playwright config can import it too.
//  run: the game has a run phase + review (ReadyEntry.review).
//  botScale: time scale for tests where the steering bot plays the run (agreed: _dummy-run ×1, clean-channels ×3).
//  hasBuildRun: lib/games/<id>/data.ts exports a pure buildRun() (seeds for C28 empty result, C36 and C39 are searched
//    in Node with it); without it the agreed dummy guarantees are used.
//  ambientMotion: the game has a non-essential effect active without input (C20 b control); otherwise the control
//    provokes a collision.
//  c19Viewports: widths where C19 runs (clean-channels: both designs, agreed for G1).
export type Variant = {
  id: string;
  dir: string;
  assetBase: string;
  run: boolean;
  botScale?: number;
  hasBuildRun?: boolean;
  ambientMotion?: boolean;
  c19Viewports?: { width: number; height: number }[];
};

export const DUMMY_VARIANT: Variant = { id: "_dummy", dir: "lib/games/_dummy", assetBase: "/games/_dummy/", run: false, ambientMotion: true };
export const RUN_VARIANT: Variant = { id: "_dummy-run", dir: "lib/games/_dummy-run", assetBase: "/games/_dummy-run/", run: true, botScale: 1, ambientMotion: true };
export const CLEAN_VARIANT: Variant = {
  id: "clean-channels",
  dir: "lib/games/clean-channels",
  assetBase: "/games/clean-channels/",
  run: true,
  botScale: 3,
  hasBuildRun: true,
  ambientMotion: false,
  c19Viewports: [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ],
};
export const ALL_VARIANTS = [DUMMY_VARIANT, RUN_VARIANT, CLEAN_VARIANT];
