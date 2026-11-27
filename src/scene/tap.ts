/**
 * Tap vs drag on the canvas (plan 005 A.5). Pure; `scene/BaseCanvas.tsx` records where the pointer
 * went down and asks this on pointer-missed, so letting go after an orbit drag does not count as a
 * tap on empty space. Track `scene`.
 */

/** Movement (CSS px) above which a press is a drag, not a tap. */
export const TAP_MAX_MOVE_PX = 8;

/** True when the pointer moved at most `TAP_MAX_MOVE_PX` between down and up. Distance is Euclidean. */
export function isTap(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_MAX_MOVE_PX;
}
