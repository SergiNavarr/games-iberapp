// JUDGE: the games the W/J suite runs against: the `_dummy` variants (E1, E2) and the real games (G1+). No Playwright
// imports here, so the Playwright config can import it too.
//  run: the game has a run phase + review (ReadyEntry.review).
//  scene: E2 "fixed scene + review" game (`_dummy-scene`, water-signs): hits from the canvas (meta.hitsFrom "game"),
//    marks with a crosshair or the pointer, review that does not score, text panel and counter. Hooks: debugScene().
//  sceneModule: the pure module with the zones (`_dummy-scene`: data.ts; water-signs: hotspots.ts, with
//    kind "distractor" and the points in POINTS; its QUESTION lives in meta.ts).
//  sceneEmptyInBrowser: the hits === 0 result can be produced as a game (false for water-signs: 7 distractors and at
//    least 8 marks; agreed in G2 that it is checked in Node).
//  sceneFullDifficulty: difficulty of C24/C25 (water-signs: "fast", the case with no spare mark; agreed in G2).
//  botScale: time scale for tests where the steering bot plays the run (agreed: _dummy-run ×1, clean-channels ×3).
//  hasBuildRun: lib/games/<id>/data.ts exports a pure buildRun() (seeds for C28 empty result, C36 and C39 are searched
//    in Node with it); without it the agreed dummy guarantees are used.
//  ambientMotion: the game has a non-essential effect active without input (C20 b control); otherwise the control
//    provokes a collision (run games) or a mark (stillWithoutInput games). clean-channels: true since G1b (the
//    paddle's stroke, motion.ambient; agreed: the collision control is dropped, C36 covers shakes and flashes).
//  stillWithoutInput: copy of meta.stillWithoutInput (E2): no motion of its own, so the [control] of C08b/C08c uses
//    input. The tests read the declaration from meta and check this copy matches it.
//  c19Viewports: widths where C19 runs (clean-channels and _dummy-scene: both designs, agreed for G1 and E2).
//  sounds: copy of meta.sounds (G1b E3b): C44–C47 with an AudioContext run on it; the games without it check that no
//    context nor mute button exists. The tests check this copy matches meta.
export type Variant = {
  id: string;
  dir: string;
  assetBase: string;
  run: boolean;
  scene?: boolean;
  sceneModule?: string;
  sceneEmptyInBrowser?: boolean;
  sceneFullDifficulty?: string;
  botScale?: number;
  hasBuildRun?: boolean;
  ambientMotion?: boolean;
  stillWithoutInput?: boolean;
  sounds?: boolean;
  c19Viewports?: { width: number; height: number }[];
};

const BOTH_DESIGNS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
];

export const DUMMY_VARIANT: Variant = { id: "_dummy", dir: "lib/games/_dummy", assetBase: "/games/_dummy/", run: false, ambientMotion: true };
export const RUN_VARIANT: Variant = { id: "_dummy-run", dir: "lib/games/_dummy-run", assetBase: "/games/_dummy-run/", run: true, botScale: 1, ambientMotion: true };
export const CLEAN_VARIANT: Variant = {
  id: "clean-channels",
  dir: "lib/games/clean-channels",
  assetBase: "/games/clean-channels/",
  run: true,
  botScale: 3,
  hasBuildRun: true,
  ambientMotion: true,
  sounds: true,
  c19Viewports: BOTH_DESIGNS,
};
export const SCENE_VARIANT: Variant = {
  id: "_dummy-scene",
  dir: "lib/games/_dummy-scene",
  assetBase: "/games/_dummy-scene/",
  run: false,
  scene: true,
  sceneModule: "data.ts",
  ambientMotion: false,
  stillWithoutInput: true,
  c19Viewports: BOTH_DESIGNS,
};
export const WATER_VARIANT: Variant = {
  id: "water-signs",
  dir: "lib/games/water-signs",
  assetBase: "/games/water-signs/",
  run: false,
  scene: true,
  sceneModule: "hotspots.ts",
  sceneEmptyInBrowser: false,
  sceneFullDifficulty: "fast",
  ambientMotion: false,
  stillWithoutInput: true,
  c19Viewports: BOTH_DESIGNS,
};
export const ALL_VARIANTS = [DUMMY_VARIANT, RUN_VARIANT, CLEAN_VARIANT, SCENE_VARIANT, WATER_VARIANT];
/**
 * Project where the tests that cover every game in one pass run (static searches, C08 alternating the games, C30 c in
 * Node, C31). Since E2: the `_dummy-scene` project.
 */
export const ONCE_VARIANT = SCENE_VARIANT;
