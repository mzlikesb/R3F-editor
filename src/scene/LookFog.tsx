import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Color, Fog } from 'three';
import { selectBlackout, useStore } from '../store';

/** Bottom colour of `SKY_GRADIENT`, and of `SKY_GRADIENT_DARK` in a blackout. */
const DAY = new Color('#2b3f5e');
const NIGHT = new Color('#0d141f');
const RATE = 3;

/** `?look=budget|max`: linear fog in the sky's horizon colour; it follows a blackout. */
export function LookFog() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const scene = get().scene;
    scene.fog = new Fog(DAY.clone(), 28, 95);
    return () => {
      scene.fog = null;
    };
  }, [get]);
  useFrame(({ scene }, delta) => {
    const fog = scene.fog;
    if (fog) fog.color.lerp(selectBlackout(useStore.getState()) ? NIGHT : DAY, Math.min(1, delta * RATE));
  });
  return null;
}
