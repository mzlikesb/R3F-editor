import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../../shared/protocol';
import { focusPose, overviewPose } from './cameraPath';
import { fogRange } from './fog';
import { cameraPosition, overviewFov, type Vec3 } from './framing';
import { GROUND_FADE_RADIUS, OVERVIEW_POINTS, OVERVIEW_TARGET } from './layout';

/**
 * Distance fog (plan 008 A.3). `THREE.Fog` counts from the camera, so near/far follow the distance
 * to what the camera looks at: the modules stay clear of the fog whether the camera is far (phone
 * overview) or close (a focused module), and the fog is full by the ground's faded rim.
 */
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

interface View {
  name: string;
  target: Vec3;
  camera: Vec3;
}

function overview(w: number, h: number): View {
  const pose = overviewPose(0, overviewFov(w / h), w, h);
  return {
    name: `overview ${w}x${h}`,
    target: OVERVIEW_TARGET,
    camera: cameraPosition(OVERVIEW_TARGET, pose.dir, pose.distance, pose.lift),
  };
}

const VIEWS: View[] = [
  overview(390, 844),
  overview(1280, 800),
  ...MODULE_IDS.flatMap((id) =>
    [true, false].map((phone) => {
      const f = focusPose(id, phone);
      return { name: `${id} ${phone ? 'phone' : 'desktop'}`, target: f.target, camera: f.camera };
    }),
  ),
];

describe('fogRange', () => {
  for (const v of VIEWS) {
    it(`${v.name}: every module is nearer than the fog start`, () => {
      const { near } = fogRange(dist(v.camera, v.target), v.target);
      for (const p of OVERVIEW_POINTS) expect(dist(v.camera, p)).toBeLessThan(near);
    });

    it(`${v.name}: the fog is full near the ground's faded rim`, () => {
      const { near, far } = fogRange(dist(v.camera, v.target), v.target);
      expect(far).toBeGreaterThan(near);
      // The rim point straight ahead, past the target.
      const dx = v.target.x - v.camera.x;
      const dz = v.target.z - v.camera.z;
      const l = Math.hypot(dx, dz);
      const rim = { x: (dx / l) * GROUND_FADE_RADIUS, y: 0, z: (dz / l) * GROUND_FADE_RADIUS };
      const d = dist(v.camera, rim);
      expect(Math.abs(d - far) / far).toBeLessThan(0.15);
    });
  }

  it('moves with the camera: zooming in pulls the fog in by the same amount', () => {
    const a = fogRange(20, OVERVIEW_TARGET);
    const b = fogRange(30, OVERVIEW_TARGET);
    expect(b.near - a.near).toBeCloseTo(10);
    expect(b.far - a.far).toBeCloseTo(10);
  });

  it('writes into the object it is given (no allocation per frame)', () => {
    const out = { near: 0, far: 0 };
    expect(fogRange(20, OVERVIEW_TARGET, out)).toBe(out);
  });
});
