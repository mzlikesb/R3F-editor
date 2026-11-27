/**
 * Keeps a label on screen (#80): a module at the edge of a phone cut its badge off, and on a PC the
 * badge slid under the top HUD. Pure; `Labels.tsx` measures and applies it.
 */
export interface LabelBox {
  left: number;
  right: number;
  top: number;
}

/** Gap kept to the screen edge and under the HUD, px. */
export const LABEL_MARGIN = 8;

/**
 * The shift (px) that brings `box` (where it would be unshifted) inside `viewportWidth`, and below
 * `hudBottom` when it would overlap the HUD (`hudBottom` 0 when there is none). A label wider than
 * the screen keeps its left edge in.
 */
export function labelShift(box: LabelBox, viewportWidth: number, hudBottom: number): { dx: number; dy: number } {
  const width = box.right - box.left;
  let dx = 0;
  if (width >= viewportWidth - LABEL_MARGIN * 2 || box.left < LABEL_MARGIN) dx = LABEL_MARGIN - box.left;
  else if (box.right > viewportWidth - LABEL_MARGIN) dx = viewportWidth - LABEL_MARGIN - box.right;
  const floor = hudBottom + LABEL_MARGIN;
  const dy = hudBottom > 0 && box.top < floor ? floor - box.top : 0;
  return { dx, dy };
}
