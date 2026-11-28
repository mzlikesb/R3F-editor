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

function fits(spec: FrameSpec, distance: number, points: readonly Vec3[], floor: readonly Vec3[]): boolean {
  const mx = 1 - (2 * spec.margin.side) / spec.width;
  const top = 1 - (2 * spec.margin.top) / spec.height;
  const bottom = -1 + (2 * spec.margin.bottom) / spec.height;
  return (
    points.every((p) => {
      const n = project(spec, distance, p);
      return Math.abs(n.x) <= mx && n.y <= top && n.y >= bottom;
    }) && floor.every((p) => project(spec, distance, p).y >= bottom)
  );
}

/**
 * Smallest camera distance (along `dir`) at which every point lies inside the free area. `floor`
 * points only have to stay above the bottom margin (a fault ring may run off the side).
 */
export function fitDistance(spec: FrameSpec, points: readonly Vec3[], floor: readonly Vec3[] = []): number {
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (fits(spec, mid, points, floor)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Pixels between the lowest of `points` and the bottom of the screen. */
function bottomGap(spec: FrameSpec, distance: number, points: readonly Vec3[]): number {
  let low = Infinity;
  for (const p of points) low = Math.min(low, project(spec, distance, p).y);
  return ((low + 1) / 2) * spec.height;
}

/**
 * The fit with the base pushed down until its lowest point (`floor` included) rests on the bottom
 * margin: the smallest `lift` at which the bottom margin binds, and the distance that goes with it.
 * On a portrait screen the width decides the distance, so this only moves the empty floor to the sky.
 */
export function liftedFit(
  spec: FrameSpec,
  points: readonly Vec3[],
  floor: readonly Vec3[],
): { distance: number; lift: number } {
  const all = [...points, ...floor];
  const at = (lift: number) => fitDistance({ ...spec, lift }, points, floor);
  let lo = 0;
  let hi = 0.6;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bottomGap({ ...spec, lift: mid }, at(mid), all) > spec.margin.bottom + 0.5) lo = mid;
    else hi = mid;
  }
  return { distance: at(hi), lift: hi };
}
