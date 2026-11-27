import { MODULE_IDS } from '../../shared/protocol';
import { LAYOUT, PROPS, floorRingRange, type Prop } from './layout';

/** A round footprint on the ground (x, z), world units. */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Where scenery may go. Headings are like `layout.ts`: 0 is +z (south), growing toward +x. */
export interface ScatterRule {
  /** Footprints stay between these distances from the base centre. */
  inner: number;
  outer: number;
  /** Only this slice of the ring: centre heading and half width (radians). Omit for the full ring. */
  arc?: { center: number; half: number };
  /** Footprint radius of one item at scale 1. */
  radius: number;
  /** Uniform scale range; 1 if omitted. */
  scale?: readonly [number, number];
  /** Free ground kept between any two footprints, and between a footprint and an avoided circle. */
  gap: number;
  avoid: readonly Circle[];
  /** Fixed facing with a little jitter; a random facing if omitted. */
  yaw?: { base: number; jitter: number };
  /** Rejected candidates allowed per item before giving up (the area is full). */
  tries?: number;
}

export interface Placement {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Footprint radius at this scale. */
  r: number;
}

/** Nothing is scattered inside this radius around the generator: the modules, their rings and the paths between. */
export const BASE_RADIUS = 13;

/** Footprint radius of each scenery GLB at scale 1 (half diagonal of its bounds, `gltf-transform inspect`). */
const PROP_RADIUS: Record<Prop['model'], number> = {
  'rock-a': 0.63,
  'rock-b': 0.66,
  'rocks-small': 0.64,
  crater: 0.55,
};

/** The hand-placed rocks and craters (`layout.PROPS`), so the generated scenery does not overlap them. */
export const PROP_KEEP_OUT: readonly Circle[] = PROPS.map((p) => ({
  x: p.x,
  z: p.z,
  r: PROP_RADIUS[p.model] * p.scale,
}));

/** The base radius, then one circle per module covering its tap box and its full-size floor ring. */
export function baseKeepOut(): Circle[] {
  const out: Circle[] = [{ x: 0, z: 0, r: BASE_RADIUS }];
  for (const id of MODULE_IDS) {
    const l = LAYOUT[id];
    const tap = Math.hypot(l.tapHalf[0], l.tapHalf[2]) * l.scale;
    out.push({ x: l.x, z: l.z, r: Math.max(tap, floorRingRange(id).to * l.scale) });
  }
  return out;
}

/** mulberry32: small, fast, and the same on every client. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic scenery placement (plan 007 A.1): positions, facings and scales for up to `count`
 * items inside `rule`, none overlapping another, an avoided circle or the ring edges. Rejection
 * sampling over a uniform grid; stops early when the area is full. Pure: same seed, same field.
 */
export function scatter(seed: number, count: number, rule: ScatterRule): Placement[] {
  const rand = seededRandom(seed);
  const [sMin, sMax] = rule.scale ?? [1, 1];
  const maxR = rule.radius * sMax;
  // Two footprints can only clash closer than one cell, so the 3x3 cells around are enough.
  const cell = maxR * 2 + rule.gap;
  const grid = new Map<number, Placement[]>();
  const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
  const out: Placement[] = [];
  const inner2 = rule.inner * rule.inner;
  const outer2 = rule.outer * rule.outer;
  let budget = count * (rule.tries ?? 60);

  const clear = (x: number, z: number, r: number) => {
    const d = Math.hypot(x, z);
    if (d - r < rule.inner || d + r > rule.outer) return false;
    for (const c of rule.avoid) if (Math.hypot(x - c.x, z - c.z) < c.r + r + rule.gap) return false;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const near = grid.get(key(cx + i, cz + j));
        if (!near) continue;
        for (const p of near) if (Math.hypot(x - p.x, z - p.z) < p.r + r + rule.gap) return false;
      }
    return true;
  };

  while (out.length < count && budget-- > 0) {
    const d = Math.sqrt(inner2 + rand() * (outer2 - inner2)); // uniform over the ring's area
    const a = rule.arc ? rule.arc.center + (rand() * 2 - 1) * rule.arc.half : rand() * Math.PI * 2;
    const scale = sMin + rand() * (sMax - sMin);
    const rotationY = rule.yaw ? rule.yaw.base + (rand() * 2 - 1) * rule.yaw.jitter : rand() * Math.PI * 2;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const r = rule.radius * scale;
    if (!clear(x, z, r)) continue;
    const p = { x, z, rotationY, scale, r };
    out.push(p);
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  return out;
}

/** A field laid out in rows: a world-aligned grid clipped to an arc of the ring, each point jittered a little. */
export interface GridRule {
  inner: number;
  outer: number;
  arc: { center: number; half: number };
  /** Grid step along x (columns) and z (rows). */
  spacing: readonly [number, number];
  /** Largest shift of an item from its grid point, on each axis. */
  jitter: number;
  /** Footprint radius of one item. */
  radius: number;
  gap: number;
  avoid: readonly Circle[];
  yaw: { base: number; jitter: number };
}

/**
 * Deterministic rows (plan 007 A.2): every grid point whose jittered centre lies inside the arc and
 * whose footprint fits inside the annulus and clears the avoided circles by `gap` (a footprint may
 * reach slightly past the arc's side edges). Pure: same seed, same field. Neighbours stay
 * `gap` apart as long as `spacing - 2 * jitter >= 2 * radius + gap` (the tests check it).
 */
export function gridScatter(seed: number, rule: GridRule): Placement[] {
  const rand = seededRandom(seed);
  const [sx, sz] = rule.spacing;
  const r = rule.radius;
  const out: Placement[] = [];
  const nx = Math.ceil(rule.outer / sx);
  const nz = Math.ceil(rule.outer / sz);
  for (let j = -nz; j <= nz; j++)
    for (let i = -nx; i <= nx; i++) {
      // Draw for every grid point, kept or not, so one rule change does not reshuffle the rest.
      const x = i * sx + (rand() * 2 - 1) * rule.jitter;
      const z = j * sz + (rand() * 2 - 1) * rule.jitter;
      const rotationY = rule.yaw.base + (rand() * 2 - 1) * rule.yaw.jitter;
      const d = Math.hypot(x, z);
      const a = Math.atan2(x, z) - rule.arc.center;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > rule.arc.half) continue;
      if (d - r < rule.inner || d + r > rule.outer) continue;
      if (rule.avoid.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r + rule.gap)) continue;
      out.push({ x, z, rotationY, scale: 1, r });
    }
  return out;
}
