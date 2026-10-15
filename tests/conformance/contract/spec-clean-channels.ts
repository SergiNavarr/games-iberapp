// JUDGE: tables of the clean-channels specification used by several specs (C26 since G1b E3a, C37–C39): composition per
// difficulty ("Distribución por dificultad"), points per waste ("Residuos y contenedores") and the maxima corrected by
// the user (165 / 195 / 250). Not a spec file: no tests here.
export const DIFFICULTIES = ["calm", "normal", "fast"] as const;
export const LAYOUTS = ["landscape", "portrait"] as const;
export const COMPOSITION: Record<string, Record<string, number>> = {
  calm: { batteries: 1, "oily-container": 2, styrofoam: 1, "glass-bottle": 2, "pet-bottle": 1, can: 2, "fruit-peel": 1 },
  normal: { batteries: 1, "oily-container": 2, styrofoam: 2, "glass-bottle": 2, "pet-bottle": 2, can: 2, "fruit-peel": 1 },
  fast: { batteries: 2, "oily-container": 2, styrofoam: 2, "glass-bottle": 2, "pet-bottle": 3, can: 2, "fruit-peel": 2 },
};
export const POINTS: Record<string, number> = { batteries: 40, "oily-container": 25, styrofoam: 20, "glass-bottle": 10, "pet-bottle": 10, can: 10, "fruit-peel": 5 };
export const WASTE_TYPES = Object.keys(POINTS);
export const EXPECTED_MAX: Record<string, number> = { calm: 165, normal: 195, fast: 250 };
