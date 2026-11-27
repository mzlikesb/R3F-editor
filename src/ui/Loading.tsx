import { useProgress } from '@react-three/drei';
import { useState } from 'react';
import '../scene/scene.css';

/**
 * `기지를 불러오는 중…` over the canvas while models and the HDRI load (plan 005 A.4). It is plain HTML
 * outside the canvas and never blocks input; the HUD and panel work regardless of loading.
 */
export function Loading() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);
  // Latch: later loads (e.g. a retry) must not bring the overlay back.
  if (!done && !active && progress >= 100) setDone(true);
  return (
    <div className={done ? 'loading loading-done' : 'loading'} aria-hidden={done} role="status">
      기지를 불러오는 중…
    </div>
  );
}
