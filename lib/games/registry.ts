import type { GameRegistry } from "./contract";

// One entry per GameId (types/portal.ts). A game becomes `ready` only once approved:
//   "clean-channels": { status: "ready", meta, load: () => import("./clean-channels") },
// where meta comes from "./clean-channels/meta" (pure data, no Phaser). Until then every entry is coming-soon.
export const REGISTRY: GameRegistry = {
  "clean-channels": { status: "coming-soon" },
  "water-signs": { status: "coming-soon" },
  "dark-sky": { status: "coming-soon" },
  "night-voices": { status: "coming-soon" },
};
