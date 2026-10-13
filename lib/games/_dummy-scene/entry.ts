import type { ReadyEntry } from "@/lib/games/contract";
import { meta } from "./meta";

// HARNESS (E2): registry-like entry for the benches (GameStage devOptions.entryOverride). `_dummy-scene` is not a GameId.
// No Phaser here: the scene is only reached through load(), the review (plain DOM) through review().
export const DUMMY_SCENE_ID = "_dummy-scene";
export const DUMMY_SCENE_TITLE = "Escena de prueba";

export const dummySceneEntry: ReadyEntry = {
  status: "ready",
  meta,
  load: () => import("./index"),
  review: () => import("@/components/harness/DummySceneReview"),
};
