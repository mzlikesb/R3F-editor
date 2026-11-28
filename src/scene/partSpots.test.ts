/**
 * Every place a part may land (`shared/parts.ts` `PART_SPOTS`) is visible and tappable in the
 * overview of a portrait phone (plan 009 R1): on screen, between the HUD band and the bottom UI,
 * off every module's tap box (and its name tag), and not hidden behind one. The candidates are a
 * constant in `shared/` so the server needs nothing from `src/scene`; this test is what keeps them true.
 */
import { describe, expect, it } from 'vitest';
import { PART_SPOTS, PART_Y, partPosition } from '../../shared/parts';
import type { BaseModuleId } from '../modules';
import { overviewPose } from './cameraPath';
import { cameraPosition, overviewFov, project, type FrameSpec, type Vec3 } from './framing';
import { LAYOUT, OVERVIEW_BOTTOM_UI, OVERVIEW_MARGIN, OVERVIEW_TARGET, PROPS } from './layout';

/** Half-size of the part's tap box (world units): what must clear the bands and the module boxes. */
const PART_TAP_HALF = 0.6;
/** Extra pixels kept round each module's tap box on screen. */
const MODULE_PAD_PX = 10;
/** Room above a module's tap box for its name tag or fault badge (as `layout.LABEL_POINTS`). */
const LABEL_ROOM = 2;

const PHONES = [
  [390, 844],
  [360, 780],
  [320, 568],
] as const;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface View {
  spec: FrameSpec;
  distance: number;
  camera: Vec3;
}

function view(width: number, height: number): View {
  const fovDeg = overviewFov(width / height);
  const pose = overviewPose(0, fovDeg, width, height);
  const spec: FrameSpec = {
    target: OVERVIEW_TARGET,
    dir: pose.dir,
    fovDeg,
    width,
    height,
    margin: OVERVIEW_MARGIN,
    lift: pose.lift,
  };
  return { spec, distance: pose.distance, camera: cameraPosition(OVERVIEW_TARGET, pose.dir, pose.distance, pose.lift) };
}

function px(v: View, p: Vec3) {
  const n = project(v.spec, v.distance, p);
  return { x: ((n.x + 1) / 2) * v.spec.width, y: ((1 - n.y) / 2) * v.spec.height };
}

function rectOf(v: View, points: readonly Vec3[], pad = 0): Rect {
  const q = points.map((p) => px(v, p));
  return {
    x0: Math.min(...q.map((p) => p.x)) - pad,
    y0: Math.min(...q.map((p) => p.y)) - pad,
    x1: Math.max(...q.map((p) => p.x)) + pad,
    y1: Math.max(...q.map((p) => p.y)) + pad,
  };
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** A module's margin tap box in world space: centre, rotation and half-sizes. */
function moduleBox(id: BaseModuleId) {
  const l = LAYOUT[id];
  const half = { x: l.tapHalf[0] * l.scale, y: (l.tapHeight * l.scale) / 2, z: l.tapHalf[2] * l.scale };
  return { cx: l.x, cy: half.y, cz: l.z, rot: l.rotationY, half };
}

/** World → module box frame (three.js Y rotation by `rot`, inverted). */
function toBox(b: ReturnType<typeof moduleBox>, p: Vec3): Vec3 {
  const dx = p.x - b.cx;
  const dz = p.z - b.cz;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return { x: c * dx - s * dz, y: p.y - b.cy, z: s * dx + c * dz };
}

function boxCorners(id: BaseModuleId): Vec3[] {
  const b = moduleBox(id);
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const lx = sx * b.half.x;
        const lz = sz * b.half.z;
        out.push({ x: b.cx + c * lx + s * lz, y: b.cy + sy * b.half.y, z: b.cz - s * lx + c * lz });
      }
  out.push({ x: b.cx, y: b.half.y * 2 + LABEL_ROOM, z: b.cz });
  return out;
}

/** Slab test: does the segment a → b pass through the module's tap box? */
function segmentHitsBox(id: BaseModuleId, a: Vec3, b: Vec3): boolean {
  const box = moduleBox(id);
  const p = toBox(box, a);
  const q = toBox(box, b);
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = q[k] - p[k];
    const h = box.half[k];
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p[k]) > h) return false;
      continue;
    }
    let lo = (-h - p[k]) / d;
    let hi = (h - p[k]) / d;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo);
    t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

function partBox(x: number, z: number): Vec3[] {
  const h = PART_TAP_HALF;
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        out.push({ x: x + sx * h, y: PART_Y + sy * h, z: z + sz * h });
      }
  return out;
}

const MODULES = Object.keys(LAYOUT) as BaseModuleId[];

/** Why a spot fails on this screen, or null when it is fine. */
function problem(v: View, x: number, z: number, phone: boolean): string | null {
  const { width, height } = v.spec;
  const r = rectOf(v, partBox(x, z));
  if (!phone) {
    return r.x0 >= 0 && r.x1 <= width && r.y0 >= 0 && r.y1 <= height ? null : 'off screen';
  }
  const side = Math.max(OVERVIEW_MARGIN.side, Math.ceil(width * 0.045));
  if (r.x0 < side || r.x1 > width - side) return 'off the sides';
  if (r.y0 < OVERVIEW_MARGIN.top) return 'under the HUD band';
  if (r.y1 > height - OVERVIEW_BOTTOM_UI) return 'under the bottom UI';
  for (const id of MODULES) {
    if (overlaps(r, rectOf(v, boxCorners(id), MODULE_PAD_PX))) return `over ${id} on screen`;
    if (segmentHitsBox(id, v.camera, { x, y: PART_Y, z })) return `behind ${id}`;
  }
  return null;
}

const ROCKS = PROPS.filter((p) => p.model !== 'crater');

describe('PART_SPOTS (plan 009 R1)', () => {
  it('has enough spots to spread the parts round', () => {
    expect(PART_SPOTS.length).toBeGreaterThanOrEqual(8);
  });

  for (const [w, h] of PHONES) {
    it(`every spot is visible and tappable in the ${w}x${h} portrait overview`, () => {
      const v = view(w, h);
      const bad = PART_SPOTS.map(([x, z]) => ({ x, z, why: problem(v, x, z, true) })).filter((s) => s.why);
      expect(bad).toEqual([]);
    });
  }

  it('every spot is on screen in the 1280x800 overview', () => {
    const v = view(1280, 800);
    const bad = PART_SPOTS.map(([x, z]) => ({ x, z, why: problem(v, x, z, false) })).filter((s) => s.why);
    expect(bad).toEqual([]);
  });

  it('no spot sits on a rock', () => {
    for (const [x, z] of PART_SPOTS) {
      for (const rock of ROCKS) expect(Math.hypot(x - rock.x, z - rock.z)).toBeGreaterThan(rock.scale);
    }
  });

  it('partPosition only ever returns a spot', () => {
    const spots = new Set(PART_SPOTS.map(([x, z]) => `${x},${z}`));
    for (let slot = 0; slot < 500; slot++) {
      const p = partPosition(180_000_000 + slot);
      expect(spots.has(`${p.x},${p.z}`)).toBe(true);
      expect(p.y).toBe(PART_Y);
    }
  });
});
