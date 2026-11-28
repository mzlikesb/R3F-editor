import { describe, expect, it } from 'vitest';
import { ASTEROIDS, ASTEROID_COUNT, BELT, BELT_SEED, beltCount, buildBelt, cameraReach, evenOrder } from './asteroids';
import { MAX_POLAR, maxCameraDistance, overviewPose } from './cameraPath';
import { cameraPosition, overviewFov } from './framing';
import { BOUNDS, LAYOUT, OVERVIEW_POINTS, OVERVIEW_TARGET } from './layout';
import { STAR_RADIUS, starPositions } from './stars';

/**
 * The asteroid belt (plan 007 A.4, C.10 stage 3). Two numeric sight conditions (neon):
 *
 * - Radius: the belt's inner edge lies beyond every camera the controls allow (any target inside
 *   the pan box, any azimuth, polar up to `MAX_POLAR`, distance up to `maxCameraDistance`). A sight
 *   line runs from the camera to a base point, both inside that radius, so it never reaches the belt:
 *   nothing of the belt can stand in front of the base.
 * - Altitude: from the overview angle (any azimuth, from the fitted distance out to the zoom limit)
 *   the line from the camera through any base point, carried on past it, passes under the belt's
 *   bottom where it crosses the belt's radii: the belt never shows behind a module or its badge
 *   either. (Orbiting down to look up at a module is looking at the sky on purpose; the radius
 *   condition still keeps the belt behind the module there.)
 *
 * Screens: aspect 0.35 (a tall narrow phone) to 21:9.
 */

const SCREENS = [
  [1280, 800],
  [390, 844],
  [360, 780],
  [320, 568],
  [320, 900],
  [768, 1024],
  [1920, 1080],
  [2560, 1080],
] as const;

/** Base points: tap box corners and tops, plus room for the badge and name tag above each top. */
const BADGE_ROOM = 2;
const BASE_POINTS = [
  ...OVERVIEW_POINTS,
  ...Object.values(LAYOUT).map((l) => ({ x: l.x, y: l.tapHeight * l.scale + BADGE_ROOM, z: l.z })),
];

const maxSize = Math.max(...ASTEROIDS.map((a) => Math.max(a.sx, a.sy, a.sz)));

function camera(target: { x: number; y: number; z: number }, az: number, polar: number, dist: number) {
  return {
    x: target.x + Math.sin(polar) * Math.sin(az) * dist,
    y: target.y + Math.cos(polar) * dist,
    z: target.z + Math.sin(polar) * Math.cos(az) * dist,
  };
}

describe('asteroid belt placement', () => {
  it('is deterministic and about 1,000 strong', () => {
    expect(buildBelt(BELT_SEED)).toEqual(ASTEROIDS);
    expect(ASTEROIDS).toHaveLength(ASTEROID_COUNT);
    expect(ASTEROID_COUNT).toBeGreaterThanOrEqual(900);
  });

  it('keeps every asteroid inside the belt volume', () => {
    for (const a of ASTEROIDS) {
      const d = Math.hypot(a.x, a.z);
      expect(d).toBeGreaterThanOrEqual(BELT.inner);
      expect(d).toBeLessThanOrEqual(BELT.outer);
      expect(a.y).toBeGreaterThanOrEqual(BELT.low);
      expect(a.y).toBeLessThanOrEqual(BELT.high);
      expect(Math.max(a.sx, a.sy, a.sz)).toBeLessThanOrEqual(BELT.size[1]);
    }
  });
});

describe('asteroid belt sight lines', () => {
  it('radius: the inner edge is beyond the farthest camera on every screen', () => {
    for (const [w, h] of SCREENS) {
      const reach = cameraReach(overviewFov(w / h), w, h);
      expect(reach).toBeGreaterThan(BOUNDS);
      expect(BELT.inner - maxSize).toBeGreaterThan(reach);
    }
  });

  it('radius: sampled sight lines from allowed cameras to the base never enter the belt', () => {
    const [w, h] = [320, 900];
    const dMax = maxCameraDistance(overviewFov(w / h), w, h);
    const targets = [
      OVERVIEW_TARGET,
      ...Object.values(LAYOUT).map((l) => ({ x: l.x, y: 0.8, z: l.z })),
      { x: BOUNDS, y: 4, z: BOUNDS },
      { x: -BOUNDS, y: 0, z: -BOUNDS },
    ];
    // One expect at the end: tens of thousands of expect() calls timed out on CI (#86).
    let farthest = 0;
    for (const t of targets)
      for (let ai = 0; ai < 12; ai++)
        for (const polar of [0.05, MAX_POLAR / 2, MAX_POLAR])
          for (const dist of [3, dMax / 2, dMax]) {
            const c = camera(t, (ai / 12) * Math.PI * 2, polar, dist);
            for (const p of BASE_POINTS)
              for (let k = 0; k <= 20; k++) {
                const s = k / 20;
                const x = c.x + (p.x - c.x) * s;
                const z = c.z + (p.z - c.z) * s;
                farthest = Math.max(farthest, Math.hypot(x, z));
              }
          }
    expect(farthest).toBeLessThan(BELT.inner - maxSize);
  });

  it('altitude: past each base point the overview sight line stays under the belt', () => {
    for (const [w, h] of [SCREENS[0], SCREENS[1], SCREENS[4]]) {
      const fov = overviewFov(w / h);
      const dMax = maxCameraDistance(fov, w, h);
      for (let ai = 0; ai < 24; ai++) {
        const az = (ai / 24) * Math.PI * 2;
        // The portrait overview lifts the camera along its up axis (plan 008 A.2): the real camera.
        const { dir, lift, distance: fit } = overviewPose(az, fov, w, h);
        for (const dist of [fit, (fit + dMax) / 2, dMax]) {
          const c = cameraPosition(OVERVIEW_TARGET, dir, dist, lift);
          for (const p of BASE_POINTS) {
            // Ray c + t (p - c), t >= 1: height where its horizontal distance reaches each belt radius.
            const dx = p.x - c.x;
            const dz = p.z - c.z;
            const qa = dx * dx + dz * dz;
            const qb = 2 * (c.x * dx + c.z * dz);
            for (const r of [BELT.inner, BELT.outer]) {
              const qc = c.x * c.x + c.z * c.z - r * r;
              const t = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
              expect(t).toBeGreaterThan(1);
              expect(c.y + (p.y - c.y) * t).toBeLessThan(BELT.low - maxSize);
            }
          }
        }
      }
    }
  });

  it('stars: every star lies behind the belt from any allowed camera, inside the far plane', () => {
    // The belt fits in a sphere of this radius around the base centre. A camera inside it sees a
    // star outside it along a ray that leaves the sphere (and so passes every belt point) first.
    const beltSphere = Math.hypot(BELT.outer + maxSize, BELT.high + maxSize);
    for (const [w, h] of SCREENS) {
      const fov = overviewFov(w / h);
      const camFar = Math.hypot(cameraReach(fov, w, h), 4 + maxCameraDistance(fov, w, h));
      expect(camFar).toBeLessThan(beltSphere);
      expect(STAR_RADIUS + camFar).toBeLessThan(400);
    }
    const stars = starPositions();
    expect(stars.length).toBeGreaterThan(0);
    for (let i = 0; i < stars.length; i += 3) {
      const [x, y, z] = [stars[i]!, stars[i + 1]!, stars[i + 2]!];
      expect(Math.hypot(x, y, z)).toBeGreaterThan(beltSphere);
      expect(y).toBeGreaterThan(0);
    }
  });

  it('stays inside the camera far plane', () => {
    expect(BELT.outer + maxSize + cameraReach(overviewFov(320 / 900), 320, 900)).toBeLessThan(400);
  });
});

describe('thinning at quality stage 3', () => {
  const sector = (x: number, z: number, n: number) =>
    Math.floor(((Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / n)) % n;

  it('beltCount rounds the fraction of the instances', () => {
    expect(beltCount(1)).toBe(ASTEROID_COUNT);
    expect(beltCount(0.5)).toBe(Math.floor(ASTEROID_COUNT / 2));
    expect(beltCount(0)).toBe(0);
  });

  it('every prefix of the instance order is spread evenly around the ring', () => {
    for (const fraction of [0.25, 0.5, 0.75]) {
      const kept = ASTEROIDS.slice(0, beltCount(fraction));
      for (const n of [4, 8, 16]) {
        const all = new Array<number>(n).fill(0);
        const drawn = new Array<number>(n).fill(0);
        for (const a of ASTEROIDS) all[sector(a.x, a.z, n)]! += 1;
        for (const a of kept) drawn[sector(a.x, a.z, n)]! += 1;
        for (let i = 0; i < n; i++) {
          expect(all[i]).toBeGreaterThan(0);
          // Within 3 percentage points of the fraction in every sector: no side empties first.
          expect(Math.abs(drawn[i]! / all[i]! - fraction)).toBeLessThan(0.03 + 2 / all[i]!);
        }
      }
    }
  });

  it('evenOrder is a permutation whose halves interleave by angle', () => {
    const angles = Array.from({ length: 10 }, (_, i) => (i * 7) % 10);
    const order = evenOrder(angles);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => i));
    // The angles are their own ranks here: the first half takes every other one around the ring.
    expect(
      order
        .slice(0, 5)
        .map((i) => angles[i]!)
        .sort((a, b) => a - b),
    ).toEqual([0, 2, 4, 6, 8]);
  });
});
