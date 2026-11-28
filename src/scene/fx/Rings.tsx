import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { Color, RingGeometry } from 'three';
import { PALETTE } from '../palette';
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

const PING_COLOR = new Color(PALETTE.ping);
/** Floor ring opacity range over one pulse. */
const FLOOR_RING_MIN = 0.45;
const FLOOR_RING_MAX = 0.95;

/**
 * Red ring pulsing outward from a faulted module on the ground, from `range.from` to `range.to`
 * (local units, `layout.floorRingRange`: it never reaches a neighbour's ring). Only drawn while `fault`.
 */
export function FloorRing({ range, fault }: { range: { from: number; to: number }; fault: boolean }) {
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
    const s = range.from + (range.to - range.from) * phase;
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

/**
 * How far (x the module's radius, on top of the radius itself) and how bright the ping gets. It
 * used to reach 3.2 radii at 0.85, which on a phone is a ring about a module wide: gone before the
 * eye got there. 5.5 radii spans to the neighbouring modules (they stand about 10 m apart, radii
 * 1 to 2.5 m), and the fade is quadratic (`1 - p^2`) so it stays near full strength through the
 * first half of the 2.6 s. The colour stays the ping lilac, never the repair green of one's own sweep.
 */
const PING_REACH = 5.5;
const PING_PEAK_OPACITY = 1;

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
    const s = radius * (1 + eased * PING_REACH);
    m.visible = true;
    m.scale.set(s, s, 1);
    setOpacity(material, PING_PEAK_OPACITY * (1 - p * p));
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
const HOLD_MATERIAL = createRingMaterial(new Color(PALETTE.hold));
HOLD_MATERIAL.opacity = 0.9;
const HOLD_SPIN = 2.4;
/**
 * The ring circles the module's body at this share of its height, this much wider than its
 * footprint. Above the top it rose into the badge or `⚠` dot (which sit `LABEL_LIFT` above the top)
 * and hid behind them, most of all on a phone.
 */
const HOLD_HEIGHT_SHARE = 0.55;
const HOLD_RADIUS_SCALE = 1.3;

/**
 * A spinning arc around a module's body while someone else is repairing it. One mesh; geometry and
 * material are shared by all modules. `radius` and `height` are the module's, in its local units.
 */
export function HoldingRing({ height, radius }: { height: number; radius: number }) {
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    const m = mesh.current;
    if (m) m.rotation.z -= delta * HOLD_SPIN;
  });
  const s = radius * HOLD_RADIUS_SCALE;
  return (
    <group position-y={height * HOLD_HEIGHT_SHARE} rotation-x={-Math.PI / 2} scale={[s, s, 1]}>
      <mesh ref={mesh} geometry={HOLD_GEOMETRY} material={HOLD_MATERIAL} raycast={() => null} />
    </group>
  );
}
