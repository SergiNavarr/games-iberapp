import type { GameStageDevOptions } from "@/components/games/GameStage";
import { GAMES } from "@/lib/data/games";
import { DUMMY_RUN_ID, DUMMY_RUN_TITLE, dummyRunEntry } from "@/lib/games/_dummy-run/entry";
import { DUMMY_ID, DUMMY_TITLE, dummyEntry } from "@/lib/games/_dummy/entry";
import type { ReadyEntry, RegistryEntry } from "@/lib/games/contract";
import { REGISTRY } from "@/lib/games/registry";
import type { GameId } from "@/types/portal";

// HARNESS: the ids the benches accept (the four GameIds and the dummies) and how each one maps to GameStage props.
const DUMMIES: Record<string, { title: string; entry: ReadyEntry }> = {
  [DUMMY_ID]: { title: DUMMY_TITLE, entry: dummyEntry },
  [DUMMY_RUN_ID]: { title: DUMMY_RUN_TITLE, entry: dummyRunEntry },
};

export const BENCH_IDS: string[] = [...GAMES.map((g) => g.id), ...Object.keys(DUMMIES)];

export const isGameId = (id: string): id is GameId => GAMES.some((g) => g.id === id);

export function benchStage(id: string): { gameId: GameId; portalId: string; title: string; entry: RegistryEntry; entryOverride?: GameStageDevOptions["entryOverride"] } {
  if (isGameId(id)) {
    const game = GAMES.find((g) => g.id === id)!;
    return { gameId: id, portalId: game.portalId, title: game.title, entry: REGISTRY[id] };
  }
  // A dummy is not a GameId: GameStage gets any GameId (ignored while the override is present) and the override.
  const dummy = DUMMIES[id] ?? DUMMIES[DUMMY_ID];
  const dummyId = DUMMIES[id] ? id : DUMMY_ID;
  return {
    gameId: "clean-channels",
    portalId: "laguna",
    title: dummy.title,
    entry: dummy.entry,
    entryOverride: { id: dummyId, title: dummy.title, entry: dummy.entry },
  };
}
