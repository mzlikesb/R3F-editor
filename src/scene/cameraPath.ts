/**
 * Camera moves that take the short way round. CameraControls keeps the azimuth as an unbounded
 * angle, so aiming at a fixed direction can swing the camera almost a full turn; these helpers turn
 * "face this way" into the nearest equivalent angle. Pure math, so it is unit tested.
 */

const TWO_PI = Math.PI * 2;

/** Wraps an angle difference into [-PI, PI]. */
export function wrapAngle(a: number): number {
  const r = a - TWO_PI * Math.round(a / TWO_PI);
  // Round-half-even can leave exactly -PI; keep the range closed on +PI.
  return r <= -Math.PI ? r + TWO_PI : r;
}

/** The angle equal to `preferred` (mod 2 PI) that is closest to `current`. */
export function nearestAzimuth(current: number, preferred: number): number {
  return current + wrapAngle(preferred - current);
}

/** Camera azimuth (angle around the vertical axis, 0 = +z) of an outward offset; `fallback` if it is ~0. */
export function outwardAzimuth(x: number, z: number, fallback: number): number {
  return Math.hypot(x, z) > 0.01 ? Math.atan2(x, z) : fallback;
}

/** Polar angle (from straight up) and distance of a camera `horizontal` out and `height` up from its target. */
export function polarPose(horizontal: number, height: number): { polar: number; distance: number } {
  return { polar: Math.atan2(horizontal, height), distance: Math.hypot(horizontal, height) };
}
