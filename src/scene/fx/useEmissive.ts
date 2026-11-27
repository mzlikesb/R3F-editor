import { useFrame } from '@react-three/fiber';
import { Color } from 'three';
import type { ModuleHandle } from '../moduleTypes';
import { FAULT_COLOR, OK_COLOR, step, SWEEP_S, useOneShot } from './shared';

const tmp = new Color();

function writeEmissive(handle: ModuleHandle, color: Color, intensity: number): void {
  for (const m of handle.materials) {
    m.emissive.copy(color);
    m.emissiveIntensity = intensity;
  }
}

/**
 * Drives the module's emissive: red pulse while faulted, red→green blend over the sweep on repair,
 * then off. A fault arriving mid-sweep wins.
 */
export function useEmissive(handle: ModuleHandle | null, faulted: boolean, sweepToken: number): void {
  const sweepRef = useOneShot(sweepToken);

  useFrame((state, delta) => {
    if (!handle) return;
    let color: Color = FAULT_COLOR;
    let intensity = 0;
    if (faulted) {
      sweepRef.current = -1;
      intensity = 0.55 + 0.45 * Math.sin(state.clock.elapsedTime * 4);
    } else if (sweepRef.current >= 0) {
      const p = step(sweepRef, delta, SWEEP_S);
      if (p >= 0 && p < 1) {
        color = tmp.copy(FAULT_COLOR).lerp(OK_COLOR, Math.min(1, p * 2));
        intensity = 1.1 * (1 - p * p);
      }
    }
    writeEmissive(handle, color, intensity);
  });
}
