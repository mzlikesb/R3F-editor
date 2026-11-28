import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { selectReady, useStore } from '../store';
import { postSettled } from '../scene/postMode';
import { usePost } from '../scene/postStore';
import '../scene/scene.css';

/**
 * `기지를 불러오는 중…` over the canvas while models and the HDRI load (plan 005 A.4), then while the
 * post-processing chunk settles (composer or plain, at most 2 s more: plan 008 B.5), and until the
 * first snapshot is in (playtest #47: the HUD said `기지 정상` under it). Until then it is the only
 * thing that speaks: the HUD, name tags, status lights and the panel field wait for `selectReady`,
 * and the pill leaves in that same render, without a fade. Plain HTML outside the canvas; it never
 * blocks input.
 */
export function Loading() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);
  // Latch: later loads (e.g. a retry) must not bring the overlay back.
  if (!done && !active && progress >= 100) setDone(true);
  // Post-processing gets at most `POST_WAIT_MS` after the scene is ready (plan 008 B.5).
  const settled = usePost((s) => postSettled(s.state.mode));
  useEffect(() => {
    if (done) usePost.getState().markSceneReady();
  }, [done]);
  // The bottom hint waits for this (it would point at modules that are not there yet).
  useEffect(() => {
    if (done && settled) useStore.getState().setLoaded();
  }, [done, settled]);
  const ready = useStore(selectReady);
  const hidden = done && ready;
  return (
    <div className={hidden ? 'loading loading-done' : 'loading'} aria-hidden={hidden} role="status">
      <span className="loading-text">기지를 불러오는 중…</span>
    </div>
  );
}
