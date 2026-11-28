/**
 * Camera shake on a repair I made or helped with (plan 008 C.1, R4, R7). Pure: `CameraShake.tsx`
 * drives `ShakeDriver` from two `useFrame` hooks and never renders by itself.
 */

import { countsForMe } from '../combo';
import type { RepairEffect } from '../feedback';

/** How long one shake lasts (ms). */
export const SHAKE_MS = 250;
/** Largest camera displacement (world units) at `SHAKE_REF_DISTANCE`. */
export const SHAKE_AMPLITUDE = 0.12;
/**
 * Camera-target distance the amplitude is tuned at (the overview camera, about 23 units out). The
 * amplitude scales with the distance so the shake is the same few pixels on screen whether the
 * camera is on the overview or focused close on one module.
 */
export const SHAKE_REF_DISTANCE = 23;
/** The scale never goes past this, whatever distance comes in. */
const MAX_SCALE = 2;

/** Largest displacement for a camera `distance` units from its target. */
export function shakeAmplitude(distance: number): number {
  const scale = Number.isFinite(distance) && distance > 0 ? Math.min(distance / SHAKE_REF_DISTANCE, MAX_SCALE) : 1;
  return SHAKE_AMPLITUDE * scale;
}

/**
 * Whether the latest repair effect should start a shake: a new one (`seq` moved) for a repair I
 * made or helped with. Someone else's repair, and a store update that left the effect alone (a
 * snapshot, a fault, a tick), do not.
 */
export function shouldShake(prev: RepairEffect | null, next: RepairEffect | null): boolean {
  return next !== null && next.seq !== prev?.seq && countsForMe(next.outcome);
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Different, non-harmonic rates per axis so the shake does not trace a line.
const RATE_X = 2 * Math.PI * 7;
const RATE_Y = 2 * Math.PI * 11;
const RATE_Z = 2 * Math.PI * 5;
const SQRT3 = Math.sqrt(3);

/**
 * The offset `elapsedMs` into a shake, written into `out` (returned), for a camera `distance` units
 * from its target (default `SHAKE_REF_DISTANCE`). 0 at the start (every axis is a sine from 0), 0
 * from `SHAKE_MS` on (and before 0), never longer than `shakeAmplitude(distance)` (each axis is at
 * most that / sqrt 3). The envelope falls off as (1 - t)^2, so the kick is up front.
 */
export function shakeOffset(elapsedMs: number, out: Vec3, distance = SHAKE_REF_DISTANCE): Vec3 {
  if (!(elapsedMs > 0 && elapsedMs < SHAKE_MS)) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const t = elapsedMs / SHAKE_MS;
  const env = (shakeAmplitude(distance) / SQRT3) * (1 - t) * (1 - t);
  out.x = env * Math.sin(RATE_X * t);
  out.y = env * Math.sin(RATE_Y * t);
  out.z = env * Math.sin(RATE_Z * t);
  return out;
}

/**
 * Adds a shake to the camera without ever leaving it there for CameraControls to see:
 * - `undo` (useFrame -2, before CameraControls at -1) takes back the offset of the previous frame;
 * - `apply` (useFrame 0, after CameraControls, before the render) adds this frame's offset.
 * - `reset` (unmount, reduced motion turned on) takes back what is on the camera and stops.
 * Holds one offset vector; nothing is allocated per frame.
 */
export class ShakeDriver {
  private readonly applied: Vec3 = { x: 0, y: 0, z: 0 };
  private startedAt = Number.NaN;

  /** Starts (or restarts) a shake at `now` (ms, same clock as `apply`). */
  start(now: number): void {
    this.startedAt = now;
  }

  undo(pos: Vec3): void {
    pos.x -= this.applied.x;
    pos.y -= this.applied.y;
    pos.z -= this.applied.z;
    this.applied.x = 0;
    this.applied.y = 0;
    this.applied.z = 0;
  }

  /** `distance`: camera to its target this frame (after CameraControls), scales the amplitude. */
  apply(pos: Vec3, now: number, distance = SHAKE_REF_DISTANCE): void {
    if (Number.isNaN(this.startedAt)) return;
    const elapsed = now - this.startedAt;
    if (elapsed >= SHAKE_MS) {
      this.startedAt = Number.NaN;
      return;
    }
    shakeOffset(elapsed, this.applied, distance);
    pos.x += this.applied.x;
    pos.y += this.applied.y;
    pos.z += this.applied.z;
  }

  reset(pos: Vec3): void {
    this.undo(pos);
    this.startedAt = Number.NaN;
  }
}
