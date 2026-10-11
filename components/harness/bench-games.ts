import type { GameStageDevOptions } from "@/components/games/GameStage";
import { GAMES } from "@/lib/data/games";
import { DUMMY_ID, DUMMY_TITLE, dummyEntry } from "@/lib/games/_dummy/entry";
import type { RegistryEntry } from "@/lib/games/contract";
import { REGISTRY } from "@/lib/games/registry";
import type { GameId } from "@/types/portal";

// HARNESS: the ids the benches accept (the four GameIds and `_dummy`) and how each one maps to GameStage props.
export const BENCH_IDS: string[] = [...GAMES.map((g) => g.id), DUMMY_ID];

export const isGameId = (id: string): id is GameId => GAMES.some((g) => g.id === id);

export function benchStage(id: string): { gameId: GameId; portalId: string; title: string; entry: RegistryEntry; entryOverride?: GameStageDevOptions["entryOverride"] } {
  if (isGameId(id)) {
    const game = GAMES.find((g) => g.id === id)!;
    return { gameId: id, portalId: game.portalId, title: game.title, entry: REGISTRY[id] };
  }
  // `_dummy` is not a GameId: GameStage gets any GameId (ignored while the override is present) and the override.
  return {
    gameId: "clean-channels",
    portalId: "laguna",
    title: DUMMY_TITLE,
    entry: dummyEntry,
    entryOverride: { id: DUMMY_ID, title: DUMMY_TITLE, entry: dummyEntry },
  };
}
