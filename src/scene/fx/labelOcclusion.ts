import type { BaseModuleId } from '../../modules';
import { LAYOUT, MODEL_BOUNDS } from '../layout';

/** Shrinks each module's footprint a little: the box around a model is bigger than what is drawn. */
const FOOTPRINT_FIT = 0.85;

const IDS = Object.keys(LAYOUT) as BaseModuleId[];

/**
 * True when another module stands between the camera and `id`'s label anchor (its top), so the label
 * belongs to something hidden behind that module. Such a label is drawn faint (playtest #54: a tag of
 * a far module floated in front of a near one and read as the near one's name).
 * Each module is a vertical cylinder (footprint radius, model height); the camera-to-anchor segment
 * is tested against it. Numbers in, boolean out: it runs every frame without allocating.
 */
export function isLabelOccluded(id: BaseModuleId, camX: number, camY: number, camZ: number): boolean {
  const own = LAYOUT[id];
  const ax = own.x;
  const ay = MODEL_BOUNDS[id].height * own.scale;
  const az = own.z;
  const dx = ax - camX;
  const dy = ay - camY;
  const dz = az - camZ;
  const a = dx * dx + dz * dz;
  if (a === 0) return false;
  for (const other of IDS) {
    if (other === id) continue;
    const l = LAYOUT[other];
    const r = Math.max(MODEL_BOUNDS[other].halfX, MODEL_BOUNDS[other].halfZ) * l.scale * FOOTPRINT_FIT;
    const top = MODEL_BOUNDS[other].height * l.scale;
    // Segment `cam + t * d`, t in [0, 1], against the circle (x - l.x)^2 + (z - l.z)^2 = r^2.
    const fx = camX - l.x;
    const fz = camZ - l.z;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) continue;
    const root = Math.sqrt(disc);
    let t0 = (-b - root) / (2 * a);
    let t1 = (-b + root) / (2 * a);
    t0 = Math.max(t0, 0);
    t1 = Math.min(t1, 1);
    if (t0 >= t1) continue;
    // Over that stretch the ray's height must dip below the other module's top (and above the ground).
    const y0 = camY + dy * t0;
    const y1 = camY + dy * t1;
    if (Math.min(y0, y1) < top && Math.max(y0, y1) > 0) return true;
  }
  return false;
}
