import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { countsForMe } from '../combo';
import { useStore } from '../store';
import { ShakeDriver } from './shake';

/** CameraControls updates at -1 (drei `CameraControls`); the undo must run before it. */
const UNDO_PRIORITY = -2;
/** After CameraControls, before the render. Never positive: R3F's own render (or the composer) stays in charge. */
const APPLY_PRIORITY = 0;

/**
 * A short camera shake when a repair I made or helped with lands (plan 008 C.1, R4, R7). Someone
 * else's repair alone does not shake. The parent leaves this out under `prefers-reduced-motion`;
 * unmounting takes the current offset back off the camera at once.
 */
export function CameraShake() {
  const camera = useThree((s) => s.camera);
  const driver = useMemo(() => new ShakeDriver(), []);

  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        const e = s.feedback.effect;
        if (e && e !== prev.feedback.effect && countsForMe(e.outcome)) driver.start(performance.now());
      }),
    [driver],
  );

  useEffect(() => () => driver.reset(camera.position), [driver, camera]);

  useFrame(() => driver.undo(camera.position), UNDO_PRIORITY);
  useFrame(() => driver.apply(camera.position, performance.now()), APPLY_PRIORITY);
  return null;
}
