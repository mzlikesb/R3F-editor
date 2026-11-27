import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { Color } from 'three';
import type { ModuleHandle } from '../moduleTypes';
import { FAULT_COLOR, OK_COLOR, step, SWEEP_S, useOneShot } from './shared';

const tmp = new Color();

/**
 * Fault pulse range. The floor is high enough that every frame reads red (playtest of PR #45: at the
 * old floor of 0.1 a screenshot caught the broken generator almost grey).
 */
const PULSE_MIN = 0.8;
const PULSE_MAX = 1.6;
const PULSE_RATE = 4;
/** A broken module's base color is dimmed to this, so the red reads as a warning, not a tint. */
const FAULT_DIM = 0.12;

function write(handle: ModuleHandle, bases: readonly Color[], color: Color, intensity: number, dim: number): void {
  handle.materials.forEach((m, i) => {
    m.emissive.copy(color);
    m.emissiveIntensity = intensity;
    const base = bases[i];
    if (base) m.color.copy(base).multiplyScalar(dim);
  });
}

/**
 * Drives the module's look: whole-body red pulse (never below `PULSE_MIN`) and a dimmed body while
 * faulted, red→green blend over the sweep on repair, then off. A fault arriving mid-sweep wins.
 * Every frame writes from `faulted` alone, so a re-fault lights up exactly like the first fault.
 */
export function useEmissive(handle: ModuleHandle | null, faulted: boolean, sweepToken: number): void {
  const sweepRef = useOneShot(sweepToken);
  // The model's own colors (palette map tint), taken once per handle before anything dims them.
  const bases = useMemo(() => handle?.materials.map((m) => m.color.clone()) ?? [], [handle]);

  useFrame((state, delta) => {
    if (!handle) return;
    let color: Color = FAULT_COLOR;
    let intensity = 0;
    let dim = 1;
    if (faulted) {
      sweepRef.current = -1;
      const wave = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * PULSE_RATE);
      intensity = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * wave;
      dim = FAULT_DIM;
    } else if (sweepRef.current >= 0) {
      const p = step(sweepRef, delta, SWEEP_S);
      if (p >= 0 && p < 1) {
        color = tmp.copy(FAULT_COLOR).lerp(OK_COLOR, Math.min(1, p * 2));
        intensity = 1.1 * (1 - p * p);
      }
    }
    write(handle, bases, color, intensity, dim);
  });
}
