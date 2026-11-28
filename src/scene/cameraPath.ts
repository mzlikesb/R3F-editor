/**
 * Camera moves that take the short way round. CameraControls keeps the azimuth as an unbounded
 * angle, so aiming at a fixed direction can swing the camera almost a full turn; these helpers turn
 * "face this way" into the nearest equivalent angle. Pure math, so it is unit tested.
 */
import type { BaseModuleId } from '../modules';
import { cameraPosition, fitDistance, liftedFit, portraitMix, type Vec3 } from './framing';
import {
  FLOOR_RING_POINTS,
  LABEL_POINTS,
  LAYOUT,
  OVERVIEW_BOTTOM_UI,
  OVERVIEW_DIR,
  OVERVIEW_MARGIN,
  OVERVIEW_POINTS,
  OVERVIEW_TARGET,
} from './layout';

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

/**
 * A portrait overview looks down a little steeper (about 38 degrees instead of 33): the ring of
 * modules stands taller on a narrow screen (plan 008 A.2).
 */
const PORTRAIT_DIR_Y = 15;

/**
 * The overview direction (camera offset from the target) turned to face `azimuth`, keeping its height
 * angle. `portrait` (`framing.portraitMix`) blends towards the steeper portrait angle.
 */
export function overviewDirAt(azimuth: number, portrait = 0): Vec3 {
  const h = Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.z);
  const y = OVERVIEW_DIR.y + (PORTRAIT_DIR_Y - OVERVIEW_DIR.y) * portrait;
  return { x: Math.sin(azimuth) * h, y, z: Math.cos(azimuth) * h };
}

export interface OverviewPose {
  fov: number;
  /** Camera offset direction from `OVERVIEW_TARGET`. */
  dir: Vec3;
  distance: number;
  /** `FrameSpec.lift`: the CameraControls focal offset is `y = -lift * distance`. */
  lift: number;
}

/**
 * The overview from `azimuth` on a `width` x `height` screen. Landscape fits the base into the free
 * area as before. Portrait (aspect 0.8 and below) fits by width with 4.5% side margins, then pushes
 * the base down onto the bottom UI line (fault rings included), so the empty floor under it shrinks
 * and the spare height goes to the sky. Between 0.8 and 1.0 the two are blended.
 */
export function overviewPose(azimuth: number, fovDeg: number, width: number, height: number): OverviewPose {
  const t = portraitMix(width / height);
  const dir = overviewDirAt(azimuth, t);
  const base = { target: OVERVIEW_TARGET, dir, fovDeg, width, height };
  const land = fitDistance({ ...base, margin: OVERVIEW_MARGIN }, OVERVIEW_POINTS);
  if (t === 0) return { fov: fovDeg, dir, distance: land, lift: 0 };
  const margin = {
    side: Math.max(OVERVIEW_MARGIN.side, Math.ceil(width * 0.045)),
    top: OVERVIEW_MARGIN.top,
    bottom: OVERVIEW_BOTTOM_UI,
  };
  const port = liftedFit({ ...base, margin }, [...OVERVIEW_POINTS, ...LABEL_POINTS], FLOOR_RING_POINTS);
  return { fov: fovDeg, dir, distance: land + (port.distance - land) * t, lift: port.lift * t };
}

/** The azimuth of the first screen: the fixed `OVERVIEW_DIR` direction. */
export const HOME_AZIMUTH = Math.atan2(OVERVIEW_DIR.x, OVERVIEW_DIR.z);

/**
 * Where the camera goes when the selection is released: the same pose as the first screen (fixed
 * azimuth, polar angle and fit distance, phone lift included). The azimuth is the equivalent angle
 * nearest to `currentAzimuth`, so the turn back is the short way round. Resizes while nothing is
 * selected do not use this; they keep whatever azimuth the player orbited to.
 */
export function overviewReturnPose(
  currentAzimuth: number,
  fovDeg: number,
  width: number,
  height: number,
): OverviewPose & { azimuth: number; polar: number } {
  const azimuth = nearestAzimuth(currentAzimuth, HOME_AZIMUTH);
  const pose = overviewPose(azimuth, fovDeg, width, height);
  return { ...pose, azimuth, polar: polarPose(Math.hypot(pose.dir.x, pose.dir.z), pose.dir.y).polar };
}

/** Distance that fits the whole base in the overview when viewed from `azimuth`. */
export function overviewDistanceAt(azimuth: number, fovDeg: number, width: number, height: number): number {
  return overviewPose(azimuth, fovDeg, width, height).distance;
}

/** Farthest overview distance over every azimuth: the zoom-out limit that always lets the base fit. */
export function overviewDistanceMax(fovDeg: number, width: number, height: number): number {
  let m = 0;
  for (let i = 0; i < 24; i++) m = Math.max(m, overviewDistanceAt((i / 24) * Math.PI * 2, fovDeg, width, height));
  return m;
}

/** Focused module's look-at height (world). Kept above the boundary floor so panning never snaps it. */
export const FOCUS_Y = 0.8;
/** A portrait phone sees a much narrower slice horizontally, so focus from further away. */
const PHONE_FOCUS_SCALE = 1.7;
/**
 * Screen-space shift of the focused module, as a fraction of the camera distance (CameraControls
 * focal offset, camera-up axis; negative moves the module down the screen). Both push it a little
 * down so its badge or name tag clears the HUD; on a phone the steeper, farther camera already keeps
 * it above the bottom panel.
 */
const FOCUS_OFFSET = { desktop: -0.06, phone: -0.08 } as const;

export interface FocusPose {
  target: Vec3;
  /** Horizontal camera distance and height when the selection jumps (no animation). */
  horizontal: number;
  height: number;
  polar: number;
  distance: number;
  /** CameraControls focal offset y. */
  offset: number;
  /** Where the camera stands, focal offset included, facing outward from the base centre. */
  camera: Vec3;
}

/** How the camera frames a selected module (`CameraRig`). */
export function focusPose(id: BaseModuleId, phone: boolean): FocusPose {
  const l = LAYOUT[id];
  const fd = l.focusDistance * (phone ? PHONE_FOCUS_SCALE : 1);
  const cy = phone ? fd * 1.15 : fd * 0.55;
  const { polar, distance } = polarPose(fd, cy);
  const offset = (phone ? FOCUS_OFFSET.phone : FOCUS_OFFSET.desktop) * distance;
  const len = Math.hypot(l.x, l.z);
  const dx = len > 0.01 ? l.x / len : 0;
  const dz = len > 0.01 ? l.z / len : 1;
  const target = { x: l.x, y: FOCUS_Y, z: l.z };
  const camera = cameraPosition(
    target,
    { x: dx * fd, y: cy - FOCUS_Y, z: dz * fd },
    Math.hypot(fd, cy - FOCUS_Y),
    -offset / distance,
  );
  return { target, horizontal: fd, height: cy, polar, distance, offset, camera };
}

/** Lowest the camera may orbit: polar angle from straight up (CameraControls `maxPolarAngle`). */
export const MAX_POLAR = Math.PI * 0.47;
/** Zoom-out limit never below this, so a wide screen can still back off a little. */
const MIN_MAX_DISTANCE = 38;

/** CameraControls `maxDistance`: a margin past the farthest overview fit. */
export function maxCameraDistance(fovDeg: number, width: number, height: number): number {
  return Math.max(MIN_MAX_DISTANCE, overviewDistanceMax(fovDeg, width, height) * 1.25);
}
