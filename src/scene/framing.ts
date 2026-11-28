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
  /**
   * Camera moved along its own up axis by `lift` x distance, looking the same way (CameraControls
   * focal offset `y = -lift * distance`): the base sits lower on the screen. 0 when omitted.
   */
  lift?: number;
}

/**
 * How portrait the screen is: 1 at aspect 0.8 and below, 0 at 1.0 and above, linear between, so a
 * split-screen tablet or a window being resized moves smoothly between the two framings (008 A.2).
 */
export function portraitMix(aspect: number): number {
  return Math.min(1, Math.max(0, (1 - aspect) / 0.2));
}

/** Vertical field of view for the overview: wider when the screen is taller than wide. */
export function overviewFov(aspect: number): number {
  return 50 + 12 * portraitMix(aspect);
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

function basis(dir: Vec3) {
  const back = norm(dir);
  const forward = { x: -back.x, y: -back.y, z: -back.z };
  const right = norm(cross(forward, { x: 0, y: 1, z: 0 }));
  return { back, forward, right, up: cross(right, forward) };
}

/** Where the camera stands: `distance` from `target` along `dir`, then `lift` x distance up its own axis. */
export function cameraPosition(target: Vec3, dir: Vec3, distance: number, lift = 0): Vec3 {
  const { back, up } = basis(dir);
  const l = lift * distance;
  return {
    x: target.x + back.x * distance + up.x * l,
    y: target.y + back.y * distance + up.y * l,
    z: target.z + back.z * distance + up.z * l,
  };
}

/** Normalized device coordinates (-1..1, y up) of `p` for a camera `distance` away along `dir`. */
export function project(spec: FrameSpec, distance: number, p: Vec3): { x: number; y: number } {
  const { forward, right, up } = basis(spec.dir);
  const cam = cameraPosition(spec.target, spec.dir, distance, spec.lift);
  const v = { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z };
  const depth = Math.max(1e-6, dot(v, forward));
  const t = Math.tan((spec.fovDeg * Math.PI) / 360);
  const aspect = spec.width / spec.height;
  return { x: dot(v, right) / (depth * t * aspect), y: dot(v, up) / (depth * t) };
}

/**
 * Each point in the camera's frame, relative to the target: depth along `forward` (the camera adds
 * its distance), and offsets along `right` and `up`. The lift moves the camera along `up` only, so
 * it changes the up offset (`u - lift * distance`) and nothing else. Computed once per fit, so a fit
 * is a few thousand multiplications (#104 QA: the nested projections cost 180 ms on a phone size).
 */
function inFrame(spec: FrameSpec, points: readonly Vec3[]): Float64Array {
  const { forward, right, up } = basis(spec.dir);
  const out = new Float64Array(points.length * 3);
  points.forEach((p, i) => {
    const q = { x: p.x - spec.target.x, y: p.y - spec.target.y, z: p.z - spec.target.z };
    out[i * 3] = dot(q, forward);
    out[i * 3 + 1] = dot(q, right);
    out[i * 3 + 2] = dot(q, up);
  });
  return out;
}

/** Screen limits in NDC and the projection scale. */
function limits(spec: FrameSpec) {
  return {
    t: Math.tan((spec.fovDeg * Math.PI) / 360),
    aspect: spec.width / spec.height,
    mx: 1 - (2 * spec.margin.side) / spec.width,
    top: 1 - (2 * spec.margin.top) / spec.height,
    bottom: -1 + (2 * spec.margin.bottom) / spec.height,
  };
}

type Limits = ReturnType<typeof limits>;
/** Rounding room: the resting lift puts a point exactly on the bottom line. */
const EPS = 1e-9;

function fits(lim: Limits, d: number, lift: number, pts: Float64Array, floor: Float64Array): boolean {
  for (let i = 0; i < pts.length; i += 3) {
    const depth = Math.max(1e-6, pts[i]! + d);
    if (Math.abs(pts[i + 1]!) / (depth * lim.t * lim.aspect) > lim.mx) return false;
    const y = (pts[i + 2]! - lift * d) / (depth * lim.t);
    if (y > lim.top + EPS || y < lim.bottom - EPS) return false;
  }
  for (let i = 0; i < floor.length; i += 3) {
    const depth = Math.max(1e-6, floor[i]! + d);
    if ((floor[i + 2]! - lift * d) / (depth * lim.t) < lim.bottom - EPS) return false;
  }
  return true;
}

/**
 * Smallest camera distance (along `dir`) at which every point lies inside the free area. `floor`
 * points only have to stay above the bottom margin (a fault ring may run off the side).
 */
export function fitDistance(spec: FrameSpec, points: readonly Vec3[], floor: readonly Vec3[] = []): number {
  const lim = limits(spec);
  const pts = inFrame(spec, points);
  const fl = inFrame(spec, floor);
  const lift = spec.lift ?? 0;
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (fits(lim, mid, lift, pts, fl)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The highest lift at distance `d` that keeps every point (`floor` included) above the bottom
 * margin: the base rests on that line. -1 if no lift fits the top margin as well.
 */
function restingLift(lim: Limits, d: number, pts: Float64Array, floor: Float64Array): number {
  let high = Infinity;
  let low = 0;
  for (const arr of [pts, floor]) {
    for (let i = 0; i < arr.length; i += 3) {
      const depth = Math.max(1e-6, arr[i]! + d);
      high = Math.min(high, (arr[i + 2]! - lim.bottom * depth * lim.t) / d);
      if (arr === pts) low = Math.max(low, (arr[i + 2]! - lim.top * depth * lim.t) / d);
    }
  }
  return high >= low ? high : -1;
}

/**
 * The fit with the base pushed down until its lowest point (`floor` included) rests on the bottom
 * margin: the smallest distance at which some lift fits, and the highest such lift (the bottom
 * margin binds). On a portrait screen the width decides the distance, so this only moves the empty
 * floor to the sky. The lift is solved in closed form at each distance step.
 */
export function liftedFit(
  spec: FrameSpec,
  points: readonly Vec3[],
  floor: readonly Vec3[],
): { distance: number; lift: number } {
  const lim = limits(spec);
  const pts = inFrame(spec, points);
  const fl = inFrame(spec, floor);
  const ok = (d: number) => {
    const lift = restingLift(lim, d, pts, fl);
    return lift >= 0 && fits(lim, d, lift, pts, fl);
  };
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return { distance: hi, lift: restingLift(lim, hi, pts, fl) };
}
