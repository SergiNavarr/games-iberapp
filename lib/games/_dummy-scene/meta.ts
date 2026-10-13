import type { GameMeta } from "@/lib/games/contract";

// HARNESS (E2): the observation path of the contract (a small water-signs). The game is the source of the result:
// `hits` = signals marked, `total` = signals in the scene (3), `score` = their points; the closing question does not
// score. `completed` is always true when the review ends.
export const meta: GameMeta = {
  instructions: [
    "Mirá la escena y marcá las señales. Un señuelo gasta una marca y no suma; tocar donde no hay nada no gasta.",
    "Es un juego de prueba del contrato: escena fija, marcas, panel de texto y una pregunta final que no suma.",
  ],
  controls: {
    pointer: "Tocá o hacé clic sobre lo que quieras marcar.",
    keyboard: "Con el escenario enfocado, mové la mira con las flechas y marcá con Enter o Espacio. En la pregunta, Tab y Enter.",
  },
  learning: "En los juegos de observación, el puntaje sale de lo que encontraste en la escena; la pregunta del final no suma.",
  total: 3,
  scoreLabel: "señales",
  // The 16:9 bands and the 4:5 frame are bg2 (camera background): this point is in both.
  backgroundProbe: { x: 8, y: 450 },
  // Only a marker's 150 ms entrance moves, and only after an input: reducedMotion shows it at once.
  essentialMotion: false,
  stillWithoutInput: true,
  difficulties: [
    { id: "calm", label: "Tranquilo", total: 3 },
    { id: "fast", label: "Atento", total: 3 },
  ],
  defaultDifficulty: "calm",
  emptyResult: { title: "No marcaste ninguna señal", text: "Probá de nuevo: mirá la escena con calma antes de marcar.", when: "hits" },
  pointsLabel: "puntos",
  hitsFrom: "game",
  textPanel: true,
  counterLabel: "marcas",
};
