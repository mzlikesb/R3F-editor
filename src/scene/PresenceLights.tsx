import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry } from 'three';
import { useStore } from '../store';
import { darkness, daylight } from './blackout';
import { fxColor } from './fx/fxGain';
import { PALETTE } from './palette';
import {
  MAX_PRESENCE_LIGHTS,
  presenceLightAt,
  presenceLightCount,
  stepLightScale,
  type LightPosition,
} from './presenceLightPath';

const GEOMETRY = new SphereGeometry(0.24, 10, 8);
/** Its plain colour, and the one that comes out of the composer's tone mapping as that (plan 008 B.4). */
const BASE = fxColor(new Color(PALETTE.presenceLight), 'tone');
/** Share of the brightness lost at the depth of a blackout: dimmer, still visible (the base is dark, the visitors are not). */
const BLACKOUT_DIM = 0.6;

const dummy = new Object3D();
const pos: LightPosition = { x: 0, y: 0, z: 0 };

/**
 * One light per other visitor, drifting over the base (#106). One `InstancedMesh` of the cap (8),
 * all drawn every frame; a light that is not there has scale 0, and the scales ease so lights
 * appear and fade instead of popping. The count comes from the store's `presence` (this player
 * excluded); where each one floats is `presenceLightAt`, the same on every screen. Never takes taps,
 * and nothing is allocated per frame.
 */
export function PresenceLights() {
  const mesh = useRef<InstancedMesh>(null);
  const scales = useRef(new Float32Array(MAX_PRESENCE_LIGHTS));
  const material = useMemo(() => new MeshBasicMaterial({ color: BASE.plain.clone(), toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    if (!m) return;
    const count = presenceLightCount(useStore.getState().sync.presence);
    const s = scales.current;
    let live = 0;
    for (let i = 0; i < MAX_PRESENCE_LIGHTS; i++) {
      s[i] = stepLightScale(s[i]!, i < count, delta);
      if (s[i]! > 0) live = i + 1;
      presenceLightAt(i, clock.elapsedTime, pos);
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.scale.setScalar(s[i]!);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.count = live;
    m.instanceMatrix.needsUpdate = true;
    material.color.copy(BASE.get()).multiplyScalar(1 - BLACKOUT_DIM * darkness(daylight.level));
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
