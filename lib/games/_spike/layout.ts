// Logical design resolutions (px) shared by every game. Same short side (720) in both layouts, so an asset measured
// in the manifest has the same on-screen proportion in 16:9 and in 4:5. The canvas backing store uses these sizes and
// CSS scales it to the stage (Phaser.Scale.FIT), so the density is fixed: 1 manifest px = 1 canvas px.
export const DESIGN_SIZES = {
  landscape: { width: 1280, height: 720 },
  portrait: { width: 720, height: 900 },
} as const;

export type DesignLayout = keyof typeof DESIGN_SIZES;

/** Layout for a stage of the given CSS size: the section is 16:9 from 700 px and 4:5 below, so the aspect decides. */
export function layoutFor(width: number, height: number): DesignLayout {
  return height > 0 && width / height < 1 ? "portrait" : "landscape";
}
