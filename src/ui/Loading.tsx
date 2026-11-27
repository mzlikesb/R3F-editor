import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { selectReady, useStore } from '../store';
import '../scene/scene.css';

/**
 * `기지를 불러오는 중…` over the canvas while models and the HDRI load (plan 005 A.4) and until the
 * first snapshot is in (playtest #47: the HUD said `기지 정상` under it). Until then it is the only
 * thing that speaks: the HUD, name tags and status lights wait for `selectReady`. Plain HTML outside
 * the canvas; it never blocks input.
 */
export function Loading() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);
  // Latch: later loads (e.g. a retry) must not bring the overlay back.
  if (!done && !active && progress >= 100) setDone(true);
  // The bottom hint waits for this (it would point at modules that are not there yet).
  useEffect(() => {
    if (done) useStore.getState().setLoaded();
  }, [done]);
  const ready = useStore(selectReady);
  const hidden = done && ready;
  return (
    <div className={hidden ? 'loading loading-done' : 'loading'} aria-hidden={hidden} role="status">
      <span className="loading-text">기지를 불러오는 중…</span>
    </div>
  );
}
