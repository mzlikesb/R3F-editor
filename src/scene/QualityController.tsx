import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  FpsMeter,
  SAMPLE_MS,
  THRESHOLDS,
  WINDOW_SEC,
  initialQuality,
  stepQuality,
  type QualityEvent,
  type QualityState,
} from './quality';
import { LADDER, TIER, useQuality } from './qualityStore';

/** What the `?perf` toggle reports instead of the measured FPS. */
const FORCED_FPS = 5;

/**
 * Measures the frame rate and moves the quality stage (plan 007 C.10-11). Frames go into a
 * preallocated ring buffer; every 0.5 s, outside the frame loop, the 2 s mean goes to `stepQuality`.
 */
export function QualityController() {
  const [meter] = useState(() => new FpsMeter());
  /** The first frame after the load finished; the warmup counts from here. */
  const startedAt = useRef<number | null>(null);

  useFrame((_, delta) => {
    if (startedAt.current !== null) meter.push(delta);
    else if (useStore.getState().loaded) startedAt.current = performance.now();
  });

  useEffect(() => {
    const th = THRESHOLDS[TIER];
    let state: QualityState | null = null;
    let forced = useQuality.getState().forceLow;

    const apply = (e: QualityEvent) => {
      if (!state) return;
      state = stepQuality(state, e, LADDER, th);
      const q = useQuality.getState();
      if (state.stage !== q.stage) q.setStage(state.stage);
    };
    const onVisibility = () => {
      meter.reset();
      apply({ type: document.hidden ? 'hidden' : 'visible', t: performance.now() });
    };
    const id = window.setInterval(() => {
      const t0 = startedAt.current;
      if (t0 === null) return;
      const t = performance.now();
      if (!state) {
        state = initialQuality(t0);
        if (document.hidden) apply({ type: 'hidden', t });
      }
      const force = useQuality.getState().forceLow;
      if (force !== forced) {
        forced = force;
        apply({ type: 'override', t });
      }
      const fps = force ? FORCED_FPS : meter.average(WINDOW_SEC);
      if (fps !== null) apply({ type: 'sample', t, fps });
    }, SAMPLE_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [meter]);

  return null;
}
