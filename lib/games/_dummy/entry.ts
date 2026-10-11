import type { ReadyEntry } from "@/lib/games/contract";
import { meta } from "./meta";

// HARNESS: registry-like entry for the benches (GameStage devOptions.entryOverride). `_dummy` is not a GameId, so it
// never enters lib/games/registry.ts. No Phaser here: the game itself is only reached through load().
export const DUMMY_ID = "_dummy";
export const DUMMY_TITLE = "Juego de prueba";

export const dummyEntry: ReadyEntry = {
  status: "ready",
  meta,
  load: () => import("./index"),
};
