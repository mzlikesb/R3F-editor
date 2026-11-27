import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { fillInstances } from './instances';
import { GROUND_RADIUS } from './layout';
import { PANELS } from './panels';
import {
  LOD_DISTANCE,
  LOD_HYSTERESIS,
  RING_SPLIT,
  ROCKS,
  ROCK_CELLS,
  ROCK_COUNT,
  ROCK_RULE,
  ROCK_SEED,
  SECTORS,
  boxDistance,
  buildRocks,
  cellOf,
  lodNear,
  splitCells,
  type Rock,
} from './rockCells';
import { PROP_KEEP_OUT, baseKeepOut } from './scatter';

/**
 * The instanced rock field (plan 007 A.3, A.5, B.8): about 1,500 rocks of two kinds, the same on
 * every client, clear of the base, the panels, the hand-placed rocks and each other, split into
 * 2 rings x 4 headings = 8 cells whose instances are stored relative to the cell centre.
 */

const world = (c: (typeof ROCK_CELLS)[number], i: Rock) => ({ x: c.center.x + i.x, z: c.center.z + i.z });

describe('rock field', () => {
  it('is deterministic: the same seed builds the same field', () => {
    expect(buildRocks(ROCK_SEED)).toEqual(ROCKS);
    expect(buildRocks(ROCK_SEED + 1)).not.toEqual(ROCKS);
  });

  it('has about 1,500 rocks of both kinds', () => {
    expect(ROCKS.length).toBeGreaterThanOrEqual(ROCK_COUNT * 0.95);
    expect(ROCKS.length).toBeLessThanOrEqual(ROCK_COUNT);
    const a = ROCKS.filter((r) => r.kind === 'rock-a').length;
    expect(a).toBeGreaterThan(ROCKS.length * 0.2);
    expect(a).toBeLessThan(ROCKS.length * 0.45);
  });

  it('keeps every footprint on the solid ground disc', () => {
    for (const r of ROCKS) expect(Math.hypot(r.x, r.z) + r.r).toBeLessThanOrEqual(GROUND_RADIUS);
  });

  it('stays clear of the base, the modules, the hand-placed rocks and craters', () => {
    for (const r of ROCKS)
      for (const c of [...baseKeepOut(), ...PROP_KEEP_OUT])
        expect(Math.hypot(r.x - c.x, r.z - c.z)).toBeGreaterThanOrEqual(c.r + r.r + ROCK_RULE.gap - 1e-9);
  });

  it('never overlaps a solar panel', () => {
    expect(PANELS.length).toBeGreaterThan(100);
    for (const r of ROCKS)
      for (const p of PANELS)
        expect(Math.hypot(r.x - p.x, r.z - p.z)).toBeGreaterThanOrEqual(p.r + r.r + ROCK_RULE.gap - 1e-9);
  });

  it('never overlaps another rock', () => {
    const sorted = [...ROCKS].sort((a, b) => a.x - b.x);
    const maxR = Math.max(...ROCKS.map((r) => r.r));
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length && sorted[j]!.x - sorted[i]!.x < maxR * 2 + ROCK_RULE.gap; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.r + b.r + ROCK_RULE.gap - 1e-9);
      }
  });
});

describe('rock cells', () => {
  it('splits the field into 2 rings x 4 headings', () => {
    expect(SECTORS).toBe(4);
    expect(ROCK_CELLS).toHaveLength(8);
    expect(new Set(ROCK_CELLS.map((c) => `${c.ring}-${c.sector}`)).size).toBe(8);
    expect(RING_SPLIT).toBeGreaterThan(ROCK_RULE.inner);
    expect(RING_SPLIT).toBeLessThan(ROCK_RULE.outer);
  });

  it('puts each rock in exactly one cell, the one its position falls in', () => {
    const total = ROCK_CELLS.reduce((n, c) => n + c.rocks.length, 0);
    expect(total).toBe(ROCKS.length);
    for (const c of ROCK_CELLS)
      for (const r of c.rocks) {
        const w = world(c, r);
        expect(cellOf(w.x, w.z)).toEqual({ ring: c.ring, sector: c.sector });
        expect(Math.hypot(w.x, w.z) < RING_SPLIT).toBe(c.ring === 'inner');
      }
  });

  it('stores positions relative to the cell centre, which sits among its rocks', () => {
    const byWorld = new Set(ROCKS.map((r) => `${r.x.toFixed(6)},${r.z.toFixed(6)}`));
    for (const c of ROCK_CELLS) {
      for (const r of c.rocks)
        expect(byWorld.has(`${world(c, r).x.toFixed(6)},${world(c, r).z.toFixed(6)}`)).toBe(true);
      const mx = c.rocks.reduce((s, r) => s + r.x, 0) / c.rocks.length;
      const mz = c.rocks.reduce((s, r) => s + r.z, 0) / c.rocks.length;
      expect(Math.hypot(mx, mz)).toBeLessThan(1e-6); // local coordinates average to the origin
      expect(cellOf(c.center.x, c.center.z).ring).toBe(c.ring);
    }
  });

  it('heading sectors are centred on south, east, north and west', () => {
    expect(cellOf(0, 20).sector).toBe(0); // +z, south
    expect(cellOf(20, 0).sector).toBe(1); // +x
    expect(cellOf(0, -20).sector).toBe(2); // -z, north
    expect(cellOf(-20, 0).sector).toBe(3);
    expect(cellOf(14, 14.01).sector).toBe(0);
    expect(cellOf(14.01, 14).sector).toBe(1);
  });

  it('splitCells keeps empty cells out and is pure', () => {
    const one: Rock[] = [{ kind: 'rock-a', x: 0, z: 20, rotationY: 0, scale: 1, r: 0.6 }];
    const cells = splitCells(one);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.center).toEqual({ x: 0, z: 20 });
    expect(cells[0]!.rocks[0]).toMatchObject({ x: 0, z: 0 });
    expect(one[0]!.z).toBe(20);
  });
});

describe('cell LOD distance', () => {
  it('the cell box holds every footprint of its rocks, in world coordinates', () => {
    for (const c of ROCK_CELLS)
      for (const r of c.rocks) {
        const w = world(c, r);
        expect(w.x - r.r).toBeGreaterThanOrEqual(c.box.minX - 1e-9);
        expect(w.x + r.r).toBeLessThanOrEqual(c.box.maxX + 1e-9);
        expect(w.z - r.r).toBeGreaterThanOrEqual(c.box.minZ - 1e-9);
        expect(w.z + r.r).toBeLessThanOrEqual(c.box.maxZ + 1e-9);
      }
  });

  it('measures to the nearest point of the box, 0 inside', () => {
    const b = { minX: 0, maxX: 10, minZ: 20, maxZ: 30, top: 1 };
    expect(boxDistance(b, 5, 0.5, 25)).toBe(0);
    expect(boxDistance(b, 5, 4, 25)).toBeCloseTo(3);
    expect(boxDistance(b, -3, 0, 16)).toBeCloseTo(5);
    expect(boxDistance(b, 13, 5, 34)).toBeCloseTo(Math.hypot(3, 4, 4));
  });

  it('a camera standing at the near edge of an outer cell draws it in full, however far its centre', () => {
    for (const c of ROCK_CELLS.filter((cell) => cell.ring === 'outer')) {
      const edge = c.rocks.reduce(
        (best, r) => {
          const w = world(c, r);
          return Math.hypot(w.x, w.z) < Math.hypot(best.x, best.z) ? w : best;
        },
        world(c, c.rocks[0]!),
      );
      // Camera 6 up, 4 inward from the cell's innermost rock.
      const d = Math.hypot(edge.x, edge.z);
      const cam = { x: (edge.x * (d - 4)) / d, y: 6, z: (edge.z * (d - 4)) / d };
      expect(lodNear(false, boxDistance(c.box, cam.x, cam.y, cam.z))).toBe(true);
    }
  });

  it('switches with hysteresis: no flicker around the threshold', () => {
    expect(lodNear(false, LOD_DISTANCE - 0.01)).toBe(true);
    expect(lodNear(false, LOD_DISTANCE + 0.01)).toBe(false);
    expect(lodNear(true, LOD_DISTANCE + 0.01)).toBe(true);
    expect(lodNear(true, LOD_DISTANCE * LOD_HYSTERESIS + 0.01)).toBe(false);
  });
});

describe('cell bounding sphere', () => {
  it('after fillInstances it encloses the cell instances, not the origin of one model', () => {
    const cell = ROCK_CELLS.find((c) => c.ring === 'outer' && c.sector === 1)!;
    const geo = new BoxGeometry(1, 0.5, 1).translate(0, 0.25, 0);
    const mesh = new InstancedMesh(geo, new MeshBasicMaterial(), cell.rocks.length);
    fillInstances(
      mesh,
      cell.rocks.map((r) => ({
        x: r.x,
        y: 0,
        z: r.z,
        rx: 0,
        ry: r.rotationY,
        rz: 0,
        sx: r.scale,
        sy: r.scale,
        sz: r.scale,
      })),
    );
    const s = mesh.boundingSphere!;
    expect(s).not.toBeNull();
    for (const r of cell.rocks)
      expect(s.center.distanceTo(new Vector3(r.x, 0, r.z))).toBeLessThanOrEqual(s.radius + 1e-6);
    // Local: centred near the cell origin, and far smaller than the whole field.
    expect(Math.hypot(s.center.x, s.center.z)).toBeLessThan(s.radius);
    expect(s.radius).toBeLessThan(GROUND_RADIUS);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(0); // needsUpdate was set
  });
});
