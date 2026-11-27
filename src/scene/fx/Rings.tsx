import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { Color, RingGeometry } from 'three';
import {
  createRingMaterial,
  FAULT_COLOR,
  OK_COLOR,
  PING_S,
  RING_GEOMETRY,
  setOpacity,
  step,
  SWEEP_S,
  useOneShot,
} from './shared';

interface RingProps {
  radius: number;
  height: number;
}

const PING_COLOR = new Color('#9fe3ff');
/** Floor ring opacity range over one pulse. */
const FLOOR_RING_MIN = 0.45;
const FLOOR_RING_MAX = 0.95;

/** Red ring pulsing outward from a faulted module on the ground. Only drawn while `fault`. */
export function FloorRing({ radius, fault }: { radius: number; fault: boolean }) {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => createRingMaterial(FAULT_COLOR), []);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    if (!fault) {
      if (m.visible) m.visible = false;
      return;
    }
    const phase = (state.clock.elapsedTime % 1.8) / 1.8;
    const s = radius * (1.15 + phase * 1.3);
    m.visible = true;
    m.scale.set(s, s, 1);
    // Never fades out completely: the ground is close in tone, so keep a visible floor.
    setOpacity(material, FLOOR_RING_MIN + (FLOOR_RING_MAX - FLOOR_RING_MIN) * (1 - phase) * (1 - phase));
  });

  return (
    <mesh
      ref={mesh}
      geometry={RING_GEOMETRY}
      material={material}
      rotation-x={-Math.PI / 2}
      position-y={0.02}
      visible={false}
    />
  );
}

/** Green ring that sweeps once from the ground to the top of the module (every repair). */
export function SweepRing({ radius, height, token }: RingProps & { token: number }) {
  const mesh = useRef<Mesh>(null);
  const timerRef = useOneShot(token);
  const material = useMemo(() => createRingMaterial(OK_COLOR, true), []);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const p = step(timerRef, delta, SWEEP_S);
    if (p < 0) return;
    if (p >= 1) {
      m.visible = false;
      return;
    }
    const s = radius * 1.25;
    m.visible = true;
    m.scale.set(s, s, 1);
    m.position.y = 0.02 + p * height;
    setOpacity(material, 0.9 * (1 - p * p));
  });

  return <mesh ref={mesh} geometry={RING_GEOMETRY} material={material} rotation-x={-Math.PI / 2} visible={false} />;
}

/** Ripple spreading flat across the ground when someone else repaired. */
export function RingPing({ radius, token }: { radius: number; token: number }) {
  const mesh = useRef<Mesh>(null);
  const timerRef = useOneShot(token);
  const material = useMemo(() => createRingMaterial(PING_COLOR, true), []);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const p = step(timerRef, delta, PING_S);
    if (p < 0) return;
    if (p >= 1) {
      m.visible = false;
      return;
    }
    const eased = 1 - (1 - p) * (1 - p);
    const s = radius * (1 + eased * 3.2);
    m.visible = true;
    m.scale.set(s, s, 1);
    setOpacity(material, 0.85 * (1 - p));
  });

  return (
    <mesh
      ref={mesh}
      geometry={RING_GEOMETRY}
      material={material}
      rotation-x={-Math.PI / 2}
      position-y={0.03}
      visible={false}
    />
  );
}

/** A three-quarter arc, so its spin reads as "in progress". Shared by every holding ring. */
const HOLD_GEOMETRY = new RingGeometry(0.8, 1, 40, 1, 0, Math.PI * 1.5);
const HOLD_MATERIAL = createRingMaterial(new Color('#ffd166'));
HOLD_MATERIAL.opacity = 0.9;
const HOLD_SPIN = 2.4;
/** World-space radius and gap above the module's top. */
const HOLD_RADIUS = 0.45;
const HOLD_LIFT = 0.4;

/**
 * A small spinning arc above a module while someone else is repairing it. One mesh; geometry and
 * material are shared by all modules. `unit` = local units per world unit (1 / module scale).
 */
export function HoldingRing({ height, unit }: { height: number; unit: number }) {
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    const m = mesh.current;
    if (m) m.rotation.z -= delta * HOLD_SPIN;
  });
  const s = HOLD_RADIUS * unit;
  return (
    <group position-y={height + HOLD_LIFT * unit} rotation-x={-Math.PI / 2} scale={[s, s, 1]}>
      <mesh ref={mesh} geometry={HOLD_GEOMETRY} material={HOLD_MATERIAL} raycast={() => null} />
    </group>
  );
}
