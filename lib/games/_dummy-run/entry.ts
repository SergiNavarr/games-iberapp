import type { ReadyEntry } from "@/lib/games/contract";
import { meta } from "./meta";

// HARNESS (E1): registry-like entry for the benches (GameStage devOptions.entryOverride). `_dummy-run` is not a GameId.
// No Phaser here: the run is only reached through load(), the review (plain DOM) through review().
export const DUMMY_RUN_ID = "_dummy-run";
export const DUMMY_RUN_TITLE = "Recorrido de prueba";

export const dummyRunEntry: ReadyEntry = {
  status: "ready",
  meta,
  load: () => import("./index"),
  review: () => import("@/components/harness/DummyRunReview"),
};
