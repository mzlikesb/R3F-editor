import { useFrame } from '@react-three/fiber';
import { damp3 } from 'maath/easing';
import { useRef } from 'react';
import { Vector3 } from 'three';
import type { ModuleHandle } from '../moduleTypes';
import { useOneShot } from './shared';

const PUNCH_S = 0.4;
const PUNCH_UP_S = 0.1;
const PUNCH_SCALE = 1.16;

interface Punch {
  base: Vector3;
  target: Vector3;
  active: boolean;
}

/** One frame of the punch. Returns the new timer value (-1 when done). */
function tickPunch(p: Punch, model: ModuleHandle['model'], t: number, delta: number): number {
  if (!p.active) {
    p.active = true;
    p.base.copy(model.scale);
  }
  const next = t + delta;
  if (next >= PUNCH_S) {
    p.active = false;
    model.scale.copy(p.base);
    return -1;
  }
  p.target.copy(p.base).multiplyScalar(next < PUNCH_UP_S ? PUNCH_SCALE : 1);
  damp3(model.scale, p.target, 0.06, delta);
  return next;
}

/** Springs the model's `scale` up and back on my repair. The only thing `feel` writes on the model. */
export function usePunch(handle: ModuleHandle | null, token: number): void {
  const timerRef = useOneShot(token);
  const punchRef = useRef<Punch>({ base: new Vector3(1, 1, 1), target: new Vector3(), active: false });

  useFrame((_, delta) => {
    if (!handle || timerRef.current < 0) return;
    timerRef.current = tickPunch(punchRef.current, handle.model, timerRef.current, delta);
  });
}
