import { MAX_POLAR, maxCameraDistance } from './cameraPath';
import type { InstanceTransform } from './instances';
import { BOUNDS } from './layout';
import { seededRandom } from './scatter';

/**
 * The asteroid belt high above the base (plan 007 A.4). Pure: placement, the thinning order and
 * the sight conditions it is built to (`asteroids.test.ts`). `AsteroidBelt.tsx` draws it.
 */

export const BELT_SEED = 4007;
export const ASTEROID_COUNT = 1000;

/**
 * Horizontal radii, heights and asteroid size (world units; size is the radius). The inner edge
 * clears the farthest camera (`cameraReach`: 58 on 1280x800, 86 on a 0.35-aspect phone); overview
 * sight lines carried past the base are underground by the time they reach it. From the overview
 * angle it sits above the top of the view; orbiting down brings it into the sky.
 */
export const BELT = { inner: 105, outer: 140, low: 18, high: 40, size: [0.8, 3.2] } as const;

/**
 * Farthest horizontal distance from the base centre any camera can reach: the pan box corner plus
 * the zoom limit at the lowest orbit.
 */
export function cameraReach(fovDeg: number, width: number, height: number): number {
  return Math.SQRT2 * BOUNDS + maxCameraDistance(fovDeg, width, height) * Math.sin(MAX_POLAR);
}

/**
 * An order in which every prefix is spread evenly around the ring: rank the items by angle, then
 * take ranks in bit-reversed order (0, n/2, n/4, 3n/4, ...). Dropping the tail (a lower `count`)
 * thins every part of the belt alike.
 */
export function evenOrder(angles: readonly number[]): number[] {
  const byAngle = angles.map((_, i) => i).sort((a, b) => angles[a]! - angles[b]!);
  let bits = 0;
  while (1 << bits < angles.length) bits++;
  const out: number[] = [];
  for (let i = 0; i < 1 << bits; i++) {
    let rev = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) rev |= 1 << (bits - 1 - b);
    if (rev < angles.length) out.push(byAngle[rev]!);
  }
  return out;
}

/** Uniform over the belt's area and height, lumpy rocks (per-axis scale), in `evenOrder`. */
export function buildBelt(seed: number): InstanceTransform[] {
  const rand = seededRandom(seed);
  const { inner, outer, low, high, size } = BELT;
  const items: InstanceTransform[] = [];
  for (let i = 0; i < ASTEROID_COUNT; i++) {
    const d = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner));
    const a = rand() * Math.PI * 2;
    const s = size[0] + rand() * rand() * (size[1] - size[0]); // mostly small, a few large
    items.push({
      x: Math.sin(a) * d,
      y: low + s + rand() * (high - low - 2 * s),
      z: Math.cos(a) * d,
      rx: rand() * Math.PI * 2,
      ry: rand() * Math.PI * 2,
      rz: rand() * Math.PI * 2,
      sx: s,
      sy: s * (0.6 + rand() * 0.4),
      sz: s * (0.7 + rand() * 0.3),
    });
  }
  return evenOrder(items.map((t) => Math.atan2(t.x, t.z))).map((i) => items[i]!);
}

export const ASTEROIDS = buildBelt(BELT_SEED);

/** Instances drawn for a quality level's `asteroidFraction`: the first ones in `evenOrder`. */
export function beltCount(fraction: number): number {
  return Math.floor(ASTEROID_COUNT * fraction);
}
