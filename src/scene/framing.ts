/**
 * Fits the whole base in the overview for any screen shape (plan 005 A.5, playtest of PR #45: a
 * portrait phone cut the outer modules). Pure math, no three.js objects, so it is unit tested.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FrameSpec {
  /** Point the camera looks at. */
  target: Vec3;
  /** Direction from the target to the camera (need not be normalized). */
  dir: Vec3;
  /** Vertical field of view in degrees. */
  fovDeg: number;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  /** Pixels kept free at the edges: HUD on top, hint/toast at the bottom. */
  margin: { side: number; top: number; bottom: number };
}

/** Vertical field of view for the overview: wider when the screen is taller than wide. */
export function overviewFov(aspect: number): number {
  return aspect < 0.8 ? 62 : 50;
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Normalized device coordinates (-1..1, y up) of `p` for a camera `distance` away along `dir`. */
export function project(spec: FrameSpec, distance: number, p: Vec3): { x: number; y: number } {
  const back = norm(spec.dir);
  const forward = { x: -back.x, y: -back.y, z: -back.z };
  const right = norm(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const cam = {
    x: spec.target.x + back.x * distance,
    y: spec.target.y + back.y * distance,
    z: spec.target.z + back.z * distance,
  };
  const v = { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z };
  const depth = Math.max(1e-6, dot(v, forward));
  const t = Math.tan((spec.fovDeg * Math.PI) / 360);
  const aspect = spec.width / spec.height;
  return { x: dot(v, right) / (depth * t * aspect), y: dot(v, up) / (depth * t) };
}

function fits(spec: FrameSpec, distance: number, points: readonly Vec3[]): boolean {
  const mx = 1 - (2 * spec.margin.side) / spec.width;
  const top = 1 - (2 * spec.margin.top) / spec.height;
  const bottom = -1 + (2 * spec.margin.bottom) / spec.height;
  return points.every((p) => {
    const n = project(spec, distance, p);
    return Math.abs(n.x) <= mx && n.y <= top && n.y >= bottom;
  });
}

/** Smallest camera distance (along `dir`) at which every point lies inside the free area. */
export function fitDistance(spec: FrameSpec, points: readonly Vec3[]): number {
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (fits(spec, mid, points)) hi = mid;
    else lo = mid;
  }
  return hi;
}
