import { GROUND_RADIUS } from './layout';
import { PANELS } from './panels';
import { BASE_RADIUS, PROP_KEEP_OUT, baseKeepOut, scatter, seededRandom, type ScatterRule } from './scatter';

/**
 * The instanced rock field (plan 007 A.3, A.5, B.8). Pure: placement, kinds and the split into
 * cells. `RockField.tsx` draws each cell as one LOD (near: the model, far: its simplified mesh).
 */

export type RockKind = 'rock-a' | 'rocks-small';
export const ROCK_KINDS: readonly RockKind[] = ['rock-a', 'rocks-small'];

export const ROCK_SEED = 3007;
export const ROCK_COUNT = 1500;
/** Share of `rock-a` (176 triangles; `rocks-small` has 60): keeps the field under the triangle cap. */
const ROCK_A_SHARE = 0.25;

/**
 * Anywhere on the solid ground outside the base, clear of the modules, the hand-placed rocks and
 * craters (`Rocks.tsx`) and every solar panel. The two models have nearly the same footprint
 * (0.63 and 0.64 at scale 1, `scatter.PROP_RADIUS`), so one rule places both.
 */
export const ROCK_RULE: ScatterRule = {
  inner: BASE_RADIUS,
  outer: GROUND_RADIUS - 2,
  radius: 0.64,
  scale: [0.45, 1.5],
  gap: 0.15,
  avoid: [...baseKeepOut(), ...PROP_KEEP_OUT, ...PANELS.map((p) => ({ x: p.x, z: p.z, r: p.r }))],
  tries: 40,
};

export interface Rock {
  kind: RockKind;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Footprint radius. */
  r: number;
}

export function buildRocks(seed: number): Rock[] {
  const pick = seededRandom(seed ^ 0x5bd1e995);
  return scatter(seed, ROCK_COUNT, ROCK_RULE).map((p) => ({
    kind: pick() < ROCK_A_SHARE ? 'rock-a' : 'rocks-small',
    x: p.x,
    z: p.z,
    rotationY: p.rotationY,
    scale: p.scale,
    r: p.r,
  }));
}

export const ROCKS = buildRocks(ROCK_SEED);

/** Inner and outer ring of cells meet here. Quality stage 4 empties the outer ring. */
export const RING_SPLIT = 28;
/** Headings per ring, centred on south (+z), east (+x), north and west. */
export const SECTORS = 4;
/** Camera distance to a cell's centre beyond which the cell draws its simplified meshes. */
export const LOD_DISTANCE = 32;

export type Ring = 'inner' | 'outer';

export function cellOf(x: number, z: number): { ring: Ring; sector: number } {
  const step = (Math.PI * 2) / SECTORS;
  const heading = Math.atan2(x, z) + step / 2;
  const sector = Math.floor((((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / step) % SECTORS;
  return { ring: Math.hypot(x, z) < RING_SPLIT ? 'inner' : 'outer', sector };
}

export interface RockCell {
  ring: Ring;
  sector: number;
  /** Mean position of its rocks: the cell group's origin. */
  center: { x: number; z: number };
  /** Positions relative to `center`. */
  rocks: Rock[];
}

/** Groups rocks by cell (empty cells left out) and moves them into cell-local coordinates. */
export function splitCells(rocks: readonly Rock[]): RockCell[] {
  const cells = new Map<string, { ring: Ring; sector: number; rocks: Rock[] }>();
  for (const r of rocks) {
    const c = cellOf(r.x, r.z);
    const key = `${c.ring}-${c.sector}`;
    const cell = cells.get(key) ?? { ...c, rocks: [] };
    cell.rocks.push(r);
    cells.set(key, cell);
  }
  return [...cells.values()].map((c) => {
    const x = c.rocks.reduce((s, r) => s + r.x, 0) / c.rocks.length;
    const z = c.rocks.reduce((s, r) => s + r.z, 0) / c.rocks.length;
    return {
      ring: c.ring,
      sector: c.sector,
      center: { x, z },
      rocks: c.rocks.map((r) => ({ ...r, x: r.x - x, z: r.z - z })),
    };
  });
}

export const ROCK_CELLS = splitCells(ROCKS);
