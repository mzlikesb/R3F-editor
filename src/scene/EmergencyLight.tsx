import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { PointLight } from 'three';
import { selectBlackout, useStore } from '../store';

const COLOR = '#ff2a1a';
const ON_INTENSITY = 90;
/** Orbit around the base center, and its height. */
const ORBIT_RADIUS = 11;
const ORBIT_HEIGHT = 4.5;
const ORBIT_RATE = 0.9;
/** Reaches the modules on the ring but not the horizon. */
const DISTANCE = 30;
const FADE_RATE = 4;

/**
 * The red emergency light that circles the base during a blackout. It is always mounted and only
 * its intensity changes: adding or removing a light recompiles every material's shader, a visible
 * hitch on phones. No shadow.
 */
export function EmergencyLight() {
  const light = useRef<PointLight>(null);

  useFrame((state, delta) => {
    const l = light.current;
    if (!l) return;
    const on = selectBlackout(useStore.getState());
    const target = on ? ON_INTENSITY : 0;
    l.intensity += (target - l.intensity) * Math.min(1, delta * FADE_RATE);
    if (!on && l.intensity < 0.01) l.intensity = 0;
    const a = state.clock.elapsedTime * ORBIT_RATE;
    l.position.set(Math.cos(a) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(a) * ORBIT_RADIUS);
  });

  return <pointLight ref={light} color={COLOR} intensity={0} distance={DISTANCE} decay={2} />;
}
