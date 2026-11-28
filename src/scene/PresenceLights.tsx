import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, MeshBasicMaterial, Object3D, OctahedronGeometry } from 'three';
import { useStore } from '../store';
import { darkness, daylight } from './blackout';
import { fxColor } from './fx/fxGain';
import { PALETTE } from './palette';
import {
  MAX_PRESENCE_LIGHTS,
  presenceBlink,
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

const dummy = new Object3D();
const pos: LightPosition = { x: 0, y: 0, z: 0 };
const tint = new Color();

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
  // The instance colour buffer exists before the first draw, so the shader compiles once.
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < MAX_PRESENCE_LIGHTS; i++) m.setColorAt(i, BASE.plain);
  }, []);

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    if (!m) return;
    const count = presenceLightCount(useStore.getState().sync.presence);
    const dim = 1 - BLACKOUT_DIM * darkness(daylight.level);
    const base = BASE.get();
    const s = scales.current;
    let live = 0;
    for (let i = 0; i < MAX_PRESENCE_LIGHTS; i++) {
      s[i] = stepLightScale(s[i]!, i < count, delta);
      if (s[i]! > 0) live = i + 1;
      presenceLightAt(i, clock.elapsedTime, pos);
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.scale.setScalar(s[i]!);
      dummy.rotation.set(0, clock.elapsedTime * SPIN + i, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, tint.copy(base).multiplyScalar(dim * presenceBlink(i, clock.elapsedTime)));
    }
    m.count = live;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[GEOMETRY, material, MAX_PRESENCE_LIGHTS]}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
