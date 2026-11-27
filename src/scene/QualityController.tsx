import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { FpsMeter, SAMPLE_MS } from './quality';
import { createQualityLoop } from './qualityLoop';
import { useQuality, watchDevicePixelRatio } from './qualityStore';

/**
 * Measures the frame rate and moves the quality stage (plan 007 C.10-11). Frames go into a
 * preallocated ring buffer; every 0.5 s, outside the frame loop, the 2 s mean goes to `stepQuality`
 * (`createQualityLoop`). Also keeps the dpr ladder in step with the device's pixel ratio.
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
    const loop = createQualityLoop({
      meter,
      startedAt: () => startedAt.current,
      isHidden: () => document.hidden,
      now: () => performance.now(),
    });
    const id = window.setInterval(loop.tick, SAMPLE_MS);
    document.addEventListener('visibilitychange', loop.onVisibility);
    const stopDpr = watchDevicePixelRatio(window, (dpr) => useQuality.getState().setDeviceDpr(dpr));
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', loop.onVisibility);
      stopDpr();
    };
  }, [meter]);

  return null;
}
