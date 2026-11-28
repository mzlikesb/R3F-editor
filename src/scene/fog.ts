/**
 * Distance fog range (plan 008 A.3). Pure, unit tested; `SceneTone` writes it into `scene.fog`
 * every frame. `THREE.Fog` counts depth from the camera, so a fixed range would fog the modules in
 * the far phone overview and do nothing in a close focus. Instead the range starts just past the
 * farthest module seen from the current target and ends near the ground's faded rim.
 */
import type { Vec3 } from './framing';
import { GROUND_FADE_RADIUS, OVERVIEW_POINTS } from './layout';

/** Fog is full this far past the base centre: close to the faded rim of the ground. */
const FOG_SPAN = GROUND_FADE_RADIUS * 0.9;

export interface FogRange {
  near: number;
  far: number;
}

/**
 * Fog range for a camera `distance` from `target`. Every module point is at most `distance + reach`
 * from the camera (triangle inequality), and fog depth is never more than that distance, so the
 * modules never take fog. Writes into `out` (no allocation per frame).
 */
export function fogRange(distance: number, target: Vec3, out: FogRange = { near: 0, far: 0 }): FogRange {
  let reach = 0;
  for (const p of OVERVIEW_POINTS) {
    const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
    if (d > reach) reach = d;
  }
  out.near = distance + reach + 1;
  out.far = distance + Math.max(FOG_SPAN + Math.hypot(target.x, target.z), reach + 10);
  return out;
}
