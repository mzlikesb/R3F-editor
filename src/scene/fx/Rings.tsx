import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { Color } from 'three';
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
    setOpacity(material, 0.7 * (1 - phase) * (1 - phase));
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
