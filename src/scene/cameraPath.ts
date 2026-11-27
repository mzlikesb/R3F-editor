/**
 * Camera moves that take the short way round. CameraControls keeps the azimuth as an unbounded
 * angle, so aiming at a fixed direction can swing the camera almost a full turn; these helpers turn
 * "face this way" into the nearest equivalent angle. Pure math, so it is unit tested.
 */
import { fitDistance, type Vec3 } from './framing';
import { OVERVIEW_DIR, OVERVIEW_MARGIN, OVERVIEW_POINTS, OVERVIEW_TARGET } from './layout';

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

/** The overview direction (camera offset from the target) turned to face `azimuth`, keeping its height angle. */
export function overviewDirAt(azimuth: number): Vec3 {
  const h = Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.z);
  return { x: Math.sin(azimuth) * h, y: OVERVIEW_DIR.y, z: Math.cos(azimuth) * h };
}

/** Distance that fits the whole base in the overview when viewed from `azimuth`. */
export function overviewDistanceAt(azimuth: number, fovDeg: number, width: number, height: number): number {
  return fitDistance(
    { target: OVERVIEW_TARGET, dir: overviewDirAt(azimuth), fovDeg, width, height, margin: OVERVIEW_MARGIN },
    OVERVIEW_POINTS,
  );
}

/** Farthest overview distance over every azimuth: the zoom-out limit that always lets the base fit. */
export function overviewDistanceMax(fovDeg: number, width: number, height: number): number {
  let m = 0;
  for (let i = 0; i < 24; i++) m = Math.max(m, overviewDistanceAt((i / 24) * Math.PI * 2, fovDeg, width, height));
  return m;
}

/** Lowest the camera may orbit: polar angle from straight up (CameraControls `maxPolarAngle`). */
export const MAX_POLAR = Math.PI * 0.47;
/** Zoom-out limit never below this, so a wide screen can still back off a little. */
const MIN_MAX_DISTANCE = 38;

/** CameraControls `maxDistance`: a margin past the farthest overview fit. */
export function maxCameraDistance(fovDeg: number, width: number, height: number): number {
  return Math.max(MIN_MAX_DISTANCE, overviewDistanceMax(fovDeg, width, height) * 1.25);
}
