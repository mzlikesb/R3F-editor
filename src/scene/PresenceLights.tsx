import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
} from 'three';
import { useStore } from '../store';
import { darkness, daylight } from './blackout';
import { fxColor } from './fx/fxGain';
import { PALETTE } from './palette';
import {
  HALO_PEAK,
  HALO_SIZE,
  MAX_PRESENCE_LIGHTS,
  presenceBlink,
  presenceHover,
  presenceLightAt,
  presenceLightCount,
  stepLightScale,
  type LightPosition,
} from './presenceLightPath';

/** A small octahedron, a drone rather than a lamp (#108: a sphere read as one more status light). */
const GEOMETRY = new OctahedronGeometry(0.34, 0);
/** Slow turn about the vertical (rad/s), so the facets catch the eye. */
const SPIN = 0.9;
/** Warm white; under the composer a little brighter, still under the Bloom threshold (plan 008 B.4). */
const BASE = fxColor(new Color(PALETTE.presenceLight), 'drone');
/** Share of the brightness lost at the depth of a blackout: dimmer, still visible (the base is dark, the visitors are not). */
const BLACKOUT_DIM = 0.6;

const HALO_GEOMETRY = new PlaneGeometry(1, 1);

/** A soft white disc fading to nothing; the instance colour tints it. Made once. */
function haloTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

const dummy = new Object3D();
const pos: LightPosition = { x: 0, y: 0, z: 0 };
const tint = new Color();

/** Draws only the first `live` instances and marks the buffers dirty. */
function flush(x: InstancedMesh, live: number): void {
  x.count = live;
  x.instanceMatrix.needsUpdate = true;
  if (x.instanceColor) x.instanceColor.needsUpdate = true;
}

/**
 * One drone per other visitor, drifting over the base (#106): a warm-white octahedron that turns
 * and blinks slowly and never blooms, so it does not read as a module's green status light (#108).
 * One `InstancedMesh` of the cap (8), all drawn every frame; a light that is not there has scale 0, and the scales ease so lights
 * appear and fade instead of popping. The count comes from the store's `presence` (this player
 * excluded); where each one floats is `presenceLightAt`, the same on every screen. Never takes taps,
 * and nothing is allocated per frame.
 */
export function PresenceLights() {
  const mesh = useRef<InstancedMesh>(null);
  const scales = useRef(new Float32Array(MAX_PRESENCE_LIGHTS));
  // White material: each drone's blink and the blackout dim go in its instance colour.
  const material = useMemo(() => new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  // A soft glow round each drone (additive, under the Bloom threshold): a light in the air, not a
  // matte pebble on the ground (#108). One more draw call for all of them.
  const halo = useRef<InstancedMesh>(null);
  const haloMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        map: haloTexture(),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      haloMaterial.map?.dispose();
      haloMaterial.dispose();
    },
    [haloMaterial],
  );
  // The instance colour buffers exist before the first draw, so the shaders compile once.
  useLayoutEffect(() => {
    for (const m of [mesh.current, halo.current]) {
      if (!m) continue;
      for (let i = 0; i < MAX_PRESENCE_LIGHTS; i++) m.setColorAt(i, BASE.plain);
    }
  }, []);

  useFrame(({ clock, camera }, delta) => {
    const m = mesh.current;
    const h = halo.current;
    if (!m || !h) return;
    const count = presenceLightCount(useStore.getState().sync.presence);
    const dim = 1 - BLACKOUT_DIM * darkness(daylight.level);
    const base = BASE.get();
    const s = scales.current;
    let live = 0;
    for (let i = 0; i < MAX_PRESENCE_LIGHTS; i++) {
      s[i] = stepLightScale(s[i]!, i < count, delta);
      if (s[i]! > 0) live = i + 1;
      presenceLightAt(i, clock.elapsedTime, pos);
      const blink = dim * presenceBlink(i, clock.elapsedTime);
      dummy.position.set(pos.x, pos.y + presenceHover(i, clock.elapsedTime), pos.z);
      dummy.scale.setScalar(s[i]!);
      dummy.rotation.set(0, clock.elapsedTime * SPIN + i, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, tint.copy(base).multiplyScalar(blink));
      // The halo faces the camera; its plane runs through the drone, so the drone hides its centre.
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(s[i]! * HALO_SIZE);
      dummy.updateMatrix();
      h.setMatrixAt(i, dummy.matrix);
      h.setColorAt(i, tint.copy(base).multiplyScalar(blink * HALO_PEAK));
    }
    // Two calls, not `for (const x of [m, h])`: no array literal per frame.
    flush(m, live);
    flush(h, live);
  });

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[GEOMETRY, material, MAX_PRESENCE_LIGHTS]}
        frustumCulled={false}
        raycast={() => null}
      />
      <instancedMesh
        ref={halo}
        args={[HALO_GEOMETRY, haloMaterial, MAX_PRESENCE_LIGHTS]}
        frustumCulled={false}
        raycast={() => null}
      />
    </>
  );
}
