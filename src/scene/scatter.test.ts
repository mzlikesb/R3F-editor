import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../../shared/protocol';
import { GROUND_RADIUS, LAYOUT, PROPS, floorRingRange } from './layout';
import { PANELS, PANEL_RULE, PANEL_SEED } from './panels';
import {
  BASE_RADIUS,
  PROP_KEEP_OUT,
  baseKeepOut,
  gridScatter,
  scatter,
  type GridRule,
  type Placement,
  type ScatterRule,
} from './scatter';

/**
 * Scenery placement (plan 007 A.1): a pure function of a seed, so every client sees the same field.
 * The rules here are what keeps scenery off the base: the base radius, each module's tap box and
 * floor ring, the existing rocks and craters, each other, and the edge of the ground disc.
 */

const ring: ScatterRule = { inner: 15, outer: 30, radius: 0.5, gap: 0.2, avoid: [] };

/** Distance from (x, z) to a module's tap box (rotated rectangle, world units); 0 inside. */
function toTapBox(id: (typeof MODULE_IDS)[number], x: number, z: number): number {
  const l = LAYOUT[id];
  const dx = x - l.x;
  const dz = z - l.z;
  // World to module local: rotate by -rotationY (three's Y rotation maps local (lx, lz) to world).
  const c = Math.cos(l.rotationY);
  const s = Math.sin(l.rotationY);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const hx = l.tapHalf[0] * l.scale;
  const hz = l.tapHalf[2] * l.scale;
  return Math.hypot(Math.max(0, Math.abs(lx) - hx), Math.max(0, Math.abs(lz) - hz));
}

function heading(p: Placement): number {
  return Math.atan2(p.x, p.z);
}

function angleDiff(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

describe('scatter', () => {
  it('gives the same field for the same seed, and a different one for another seed', () => {
    expect(scatter(7, 200, ring)).toEqual(scatter(7, 200, ring));
    expect(scatter(8, 200, ring)).not.toEqual(scatter(7, 200, ring));
  });

  it('keeps every item and its footprint inside the annulus', () => {
    for (const p of scatter(3, 300, { ...ring, scale: [0.8, 1.6] })) {
      const d = Math.hypot(p.x, p.z);
      expect(d - p.r).toBeGreaterThanOrEqual(ring.inner - 1e-9);
      expect(d + p.r).toBeLessThanOrEqual(ring.outer + 1e-9);
      expect(p.scale).toBeGreaterThanOrEqual(0.8);
      expect(p.scale).toBeLessThanOrEqual(1.6);
      expect(p.r).toBeCloseTo(ring.radius * p.scale, 9);
    }
  });

  it('keeps the minimum gap between any two footprints', () => {
    const out = scatter(5, 400, { ...ring, scale: [0.7, 1.5] });
    expect(out.length).toBe(400);
    expectApart(out, ring.gap);
  });

  it('stays out of every avoided circle by the gap', () => {
    const avoid = [
      { x: 0, z: 20, r: 4 },
      { x: -18, z: 0, r: 3 },
    ];
    for (const p of scatter(11, 300, { ...ring, avoid }))
      for (const c of avoid)
        expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(c.r + p.r + ring.gap - 1e-9);
  });

  it('keeps to the arc and the yaw it was given', () => {
    const rule: ScatterRule = { ...ring, arc: { center: 0, half: 0.6 }, yaw: { base: 0.3, jitter: 0.1 } };
    for (const p of scatter(2, 150, rule)) {
      expect(angleDiff(heading(p), 0)).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(angleDiff(p.rotationY, 0.3)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });

  it('returns fewer items instead of hanging when the area is full', () => {
    const out = scatter(1, 5000, { inner: 15, outer: 17, radius: 0.5, gap: 0.2, avoid: [] });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(5000);
  });
});

describe('base keep-out', () => {
  it('covers every module tap box and full-size floor ring', () => {
    const circles = baseKeepOut();
    for (const id of MODULE_IDS) {
      const l = LAYOUT[id];
      const ringR = floorRingRange(id).to * l.scale;
      const tapR = Math.hypot(l.tapHalf[0], l.tapHalf[2]) * l.scale;
      const covered = circles.some((c) => Math.hypot(c.x - l.x, c.z - l.z) + Math.max(ringR, tapR) <= c.r + 1e-9);
      expect(covered, id).toBe(true);
    }
  });

  it('starts with the base radius around the generator', () => {
    expect(baseKeepOut()[0]).toEqual({ x: 0, z: 0, r: BASE_RADIUS });
  });

  it('has one circle per existing rock and crater', () => {
    expect(PROP_KEEP_OUT.length).toBe(PROPS.length);
  });
});

describe('gridScatter', () => {
  const rule: GridRule = {
    inner: 15,
    outer: 35,
    arc: { center: Math.PI, half: 0.8 },
    spacing: [3, 3],
    jitter: 0.12,
    radius: 1.2,
    gap: 0.2,
    avoid: [{ x: 0, z: -25, r: 3 }],
    yaw: { base: 0, jitter: 0.05 },
  };

  it('gives the same field for the same seed, and only jitter differs for another seed', () => {
    const a = gridScatter(4, rule);
    expect(gridScatter(4, rule)).toEqual(a);
    expect(gridScatter(5, rule)).not.toEqual(a);
  });

  it('keeps rows and columns: each item within the jitter of a grid point, yaw within its jitter', () => {
    for (const p of gridScatter(4, rule)) {
      const gx = Math.round(p.x / 3) * 3;
      const gz = Math.round(p.z / 3) * 3;
      expect(Math.abs(p.x - gx)).toBeLessThanOrEqual(0.12 + 1e-9);
      expect(Math.abs(p.z - gz)).toBeLessThanOrEqual(0.12 + 1e-9);
      expect(angleDiff(p.rotationY, 0)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(p.scale).toBe(1);
    }
  });

  it('keeps to the arc, the annulus, the avoided circles and the gap', () => {
    const out = gridScatter(4, rule);
    expect(out.length).toBeGreaterThan(20);
    for (const p of out) {
      const d = Math.hypot(p.x, p.z);
      expect(angleDiff(heading(p), Math.PI)).toBeLessThanOrEqual(0.8 + 1e-9);
      expect(d - p.r).toBeGreaterThanOrEqual(rule.inner - 1e-9);
      expect(d + p.r).toBeLessThanOrEqual(rule.outer + 1e-9);
      for (const c of rule.avoid) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(c.r + p.r + rule.gap);
    }
    expectApart(out, rule.gap);
  });
});

function expectApart(list: readonly Placement[], gap: number) {
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.r + b.r + gap - 1e-9);
    }
}

describe('solar panel field', () => {
  it('is about 200-250 panels in rows, deterministic', () => {
    expect(PANELS.length).toBeGreaterThanOrEqual(200);
    expect(PANELS.length).toBeLessThanOrEqual(250);
    expect(gridScatter(PANEL_SEED, PANEL_RULE)).toEqual(PANELS);
  });

  it('lies north of the base (-z, behind it in the default overview), well outside the base, inside the ground disc', () => {
    expect(PANEL_RULE.outer).toBeLessThanOrEqual(GROUND_RADIUS);
    expect(PANEL_RULE.inner).toBeGreaterThanOrEqual(18);
    for (const p of PANELS) {
      expect(angleDiff(heading(p), Math.PI)).toBeLessThan(Math.PI / 2);
      expect(Math.hypot(p.x, p.z) - p.r).toBeGreaterThanOrEqual(18);
      expect(Math.hypot(p.x, p.z) + p.r).toBeLessThanOrEqual(GROUND_RADIUS);
    }
  });

  it('keeps off the base: base radius, module tap boxes and floor rings', () => {
    for (const p of PANELS) {
      expect(Math.hypot(p.x, p.z) - p.r).toBeGreaterThanOrEqual(BASE_RADIUS);
      for (const id of MODULE_IDS) {
        const l = LAYOUT[id];
        expect(toTapBox(id, p.x, p.z), id).toBeGreaterThan(p.r);
        expect(Math.hypot(p.x - l.x, p.z - l.z) - p.r, id).toBeGreaterThan(floorRingRange(id).to * l.scale);
      }
    }
  });

  it('does not overlap the existing rocks and craters', () => {
    for (const p of PANELS)
      for (const c of PROP_KEEP_OUT) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(c.r + p.r);
  });

  it('keeps the panels apart', () => {
    expectApart(PANELS, PANEL_RULE.gap);
  });
});
