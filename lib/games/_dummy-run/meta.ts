import type { GameMeta } from "@/lib/games/contract";

// HARNESS (E1): the run + review path of the contract. `completed` is always true when the run ends; `total` is what
// was collected, `hits` the objects classified right, `score` their points (round 10, square 5).
export const meta: GameMeta = {
  instructions: [
    "Mové la barra para recolectar los objetos que bajan por el carril. Después vas a clasificar cada uno.",
    "Es un juego de prueba del contrato: recorrido, revisión, dificultad y puntaje.",
  ],
  controls: {
    pointer: "Mantené apretado sobre el carril y mové el puntero o el dedo hacia los costados.",
    keyboard: "Con el escenario enfocado, usá las flechas izquierda y derecha. En la revisión, Tab y Enter.",
  },
  learning: "En los juegos con recorrido, primero se juntan las cosas y después se aprende con cada una.",
  total: 6,
  scoreLabel: "aciertos",
  backgroundProbe: { x: 40, y: 40 },
  // The lane scrolls by itself: that motion is the play. reducedMotion only stops the pulse, shakes and flashes.
  essentialMotion: true,
  difficulties: [
    { id: "calm", label: "Tranquilo", total: 4 },
    { id: "fast", label: "Rápido", total: 6 },
  ],
  defaultDifficulty: "calm",
  collectLabel: "recolectados",
  emptyResult: { title: "No recolectaste nada", text: "Probá de nuevo y acercate a los objetos que bajan." },
  pointsLabel: "puntos",
};
