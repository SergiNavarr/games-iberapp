import type { GameMeta } from "@/lib/games/contract";

// HARNESS (T4): minimal game that exercises the whole contract. `completed` when the three targets are hit
// (hits === total); there is no way to lose.
export const meta: GameMeta = {
  instructions: ["Tocá los tres objetivos del escenario.", "Es un juego de prueba: sirve para verificar que cada minijuego cumple el contrato con la landing."],
  controls: {
    pointer: "Tocá o hacé clic en cada objetivo.",
    keyboard: "Con el escenario enfocado, usá las flechas para elegir un objetivo y Enter o Espacio para tocarlo.",
  },
  learning: "Cada minijuego cuenta tus aciertos, te avisa en voz alta lo que pasa y guarda tu mejor resultado en este dispositivo.",
  total: 3,
  scoreLabel: "objetivos",
  backgroundProbe: { x: 40, y: 40 },
  // Nothing moves without input except decoration, which reducedMotion stops: canvas captures stay identical (C20b).
  essentialMotion: false,
};
