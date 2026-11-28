import { Box3, Euler, Matrix4, Quaternion, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../../shared/protocol';
import type { BaseModuleId } from '../modules';
import { fitDistance, overviewFov } from './framing';
import {
  LAYOUT,
  MODEL_BOUNDS,
  OVERVIEW_DIR,
  OVERVIEW_MARGIN,
  OVERVIEW_POINTS,
  OVERVIEW_TARGET,
  FLOOR_RING_POINTS,
  floorRingRange,
  selectRingRadius,
  type ModuleLayout,
} from './layout';
import { pickTap, type TapHit } from './tapPick';

/**
 * Taps, as `scene/Module.tsx` wires them: each module has an invisible box over its model ("body")
 * and a larger one around it ("margin", generous for fingers). Rays here stand in for three's
 * raycaster, with the same nearest-first order R3F hands to the handler (`e.intersections`).
 */
type Layouts = Record<BaseModuleId, ModuleLayout>;

function matrixOf(l: ModuleLayout): Matrix4 {
  return new Matrix4().compose(
    new Vector3(l.x, 0, l.z),
    new Quaternion().setFromEuler(new Euler(0, l.rotationY, 0)),
    new Vector3(l.scale, l.scale, l.scale),
  );
}

function localBox(id: BaseModuleId, part: TapHit['part'], layouts: Layouts): Box3 {
  if (part === 'body') {
    const b = MODEL_BOUNDS[id];
    return new Box3(new Vector3(-b.halfX, 0, -b.halfZ), new Vector3(b.halfX, b.height, b.halfZ));
  }
  const l = layouts[id];
  return new Box3(new Vector3(-l.tapHalf[0], 0, -l.tapHalf[2]), new Vector3(l.tapHalf[0], l.tapHeight, l.tapHalf[2]));
}

/** Every box the ray goes through, nearest first. */
function hits(ray: Ray, layouts: Layouts, parts: readonly TapHit['part'][]): TapHit[] {
  const found: { hit: TapHit; d: number }[] = [];
  for (const id of MODULE_IDS) {
    const m = matrixOf(layouts[id]);
    const local = ray.clone().applyMatrix4(m.clone().invert());
    for (const part of parts) {
      const p = local.intersectBox(localBox(id, part, layouts), new Vector3());
      if (p) found.push({ hit: { moduleId: id, part }, d: p.applyMatrix4(m).distanceTo(ray.origin) });
    }
  }
  return found.sort((a, b) => a.d - b.d).map((f) => f.hit);
}

/** The module whose model the ray meets first: what the player sees under the finger. */
function seen(ray: Ray): BaseModuleId | null {
  return hits(ray, LAYOUT, ['body'])[0]?.moduleId ?? null;
}

/** Points spread through each model's volume. */
function samples(id: BaseModuleId): Vector3[] {
  const b = MODEL_BOUNDS[id];
  const m = matrixOf(LAYOUT[id]);
  const out: Vector3[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++)
      for (let k = 0; k <= n; k++)
        out.push(
          new Vector3(
            (i / n - 0.5) * 1.9 * b.halfX,
            (j / n) * 0.95 * b.height,
            (k / n - 0.5) * 1.9 * b.halfZ,
          ).applyMatrix4(m),
        );
  return out;
}

function overviewCamera(width: number, height: number): Vector3 {
  const fov = overviewFov(width / height);
  const d = fitDistance(
    { target: OVERVIEW_TARGET, dir: OVERVIEW_DIR, fovDeg: fov, width, height, margin: OVERVIEW_MARGIN },
    OVERVIEW_POINTS,
  );
  const len = Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.y, OVERVIEW_DIR.z);
  return new Vector3(
    OVERVIEW_TARGET.x + (OVERVIEW_DIR.x / len) * d,
    OVERVIEW_TARGET.y + (OVERVIEW_DIR.y / len) * d,
    OVERVIEW_TARGET.z + (OVERVIEW_DIR.z / len) * d,
  );
}

/** Orbit positions around the base, as a player can drag to. */
const ORBITS = [8, 16].flatMap((y) =>
  Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return new Vector3(Math.sin(a) * 20, y, Math.cos(a) * 20);
  }),
);

/** For every visible sample point, which module a tap picks with `pick`. Returns the wrong ones. */
function mismatches(cameras: readonly Vector3[], pick: (ray: Ray) => BaseModuleId | null): string[] {
  const wrong: string[] = [];
  for (const cam of cameras) {
    for (const id of MODULE_IDS) {
      for (const p of samples(id)) {
        const ray = new Ray(cam, p.clone().sub(cam).normalize());
        if (seen(ray) !== id) continue; // hidden behind another model
        const got = pick(ray);
        if (got !== id) wrong.push(`${id}->${got}`);
      }
    }
  }
  return wrong;
}

const OVERVIEWS = [overviewCamera(390, 844), overviewCamera(1280, 800)];

describe('tap boxes (playtest #47: tapped the oxygen tank, got the generator)', () => {
  it('reproduces the bug: the old generator box stood in front of the lower oxygen tank in the overview', () => {
    const old: Layouts = { ...LAYOUT, generator: { ...LAYOUT.generator, tapHalf: [0.7, 0.9, 0.85], tapHeight: 1 } };
    const nearestOldBox = (ray: Ray) => hits(ray, old, ['margin'])[0]?.moduleId ?? null;
    const wrong = mismatches(OVERVIEWS, nearestOldBox);
    expect(wrong.length).toBeGreaterThan(0);
    expect(new Set(wrong)).toContain('oxygen->generator');
  });

  it('every margin box still covers its whole model', () => {
    for (const id of MODULE_IDS) {
      const l = LAYOUT[id];
      const b = MODEL_BOUNDS[id];
      expect(l.tapHalf[0]).toBeGreaterThanOrEqual(b.halfX);
      expect(l.tapHalf[2]).toBeGreaterThanOrEqual(b.halfZ);
      expect(l.tapHeight).toBeGreaterThanOrEqual(b.height);
    }
  });

  it('in the overview, even the nearest margin box alone is the module you see', () => {
    expect(mismatches(OVERVIEWS, (ray) => hits(ray, LAYOUT, ['margin'])[0]?.moduleId ?? null)).toEqual([]);
  });

  it('from any orbit angle, a tap on a model picks that model (body first, margin only off the models)', () => {
    const cameras = [...OVERVIEWS, ...ORBITS];
    expect(mismatches(cameras, (ray) => pickTap(hits(ray, LAYOUT, ['body', 'margin'])))).toEqual([]);
  });
});

describe('pickTap', () => {
  it('prefers the nearest body, then the nearest margin', () => {
    expect(
      pickTap([
        { moduleId: 'generator', part: 'margin' },
        { moduleId: 'oxygen', part: 'body' },
        { moduleId: 'generator', part: 'body' },
      ]),
    ).toBe('oxygen');
    expect(
      pickTap([
        { moduleId: 'comms', part: 'margin' },
        { moduleId: 'habitat', part: 'margin' },
      ]),
    ).toBe('comms');
    expect(pickTap([])).toBeNull();
  });
});

describe('floor rings (neon: two broken neighbours, crossing rings)', () => {
  const world = (id: BaseModuleId) => {
    const { from, to } = floorRingRange(id);
    return { from: from * LAYOUT[id].scale, to: to * LAYOUT[id].scale };
  };
  const footprint = (id: BaseModuleId) => Math.max(MODEL_BOUNDS[id].halfX, MODEL_BOUNDS[id].halfZ) * LAYOUT[id].scale;

  it('never reach a neighbour’s ring, at full size', () => {
    for (const a of MODULE_IDS) {
      for (const b of MODULE_IDS) {
        if (a === b) continue;
        const d = Math.hypot(LAYOUT[a].x - LAYOUT[b].x, LAYOUT[a].z - LAYOUT[b].z);
        expect(world(a).to + world(b).to).toBeLessThanOrEqual(d);
      }
    }
  });

  it('start just outside the module and still spread', () => {
    for (const id of MODULE_IDS) {
      const r = world(id);
      expect(r.from).toBeGreaterThan(footprint(id));
      expect(r.to).toBeGreaterThan(r.from * 1.3);
    }
  });
});

describe('selection ring (plan 008 B.1)', () => {
  it('sits just outside the tap box, inside where the fault ring starts', () => {
    for (const id of MODULE_IDS) {
      const r = selectRingRadius(id);
      expect(r).toBeGreaterThan(Math.max(LAYOUT[id].tapHalf[0], LAYOUT[id].tapHalf[2]));
      // The ring geometry is 0.9..1 of its radius: the fault ring's inner start stays clear of it.
      expect(floorRingRange(id).from * 0.9).toBeGreaterThan(r);
    }
  });

  it('floor ring points mark each fault ring at full size, for the overview framing', () => {
    for (const id of MODULE_IDS) {
      const l = LAYOUT[id];
      const own = FLOOR_RING_POINTS.filter(
        (p) => Math.hypot(p.x - l.x, p.z - l.z) < floorRingRange(id).to * l.scale + 0.01,
      );
      expect(own.length).toBeGreaterThanOrEqual(8);
    }
    for (const p of FLOOR_RING_POINTS) expect(p.y).toBe(0);
  });
});
