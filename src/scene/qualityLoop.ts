import {
  WINDOW_SEC,
  THRESHOLDS,
  initialQuality,
  stepQuality,
  type FpsMeter,
  type QualityEvent,
  type QualityState,
} from './quality';
import { getTier, useQuality } from './qualityStore';

/** What the `?perf` toggle reports instead of the measured FPS. */
export const FORCED_FPS = 5;

export interface QualityLoopDeps {
  meter: FpsMeter;
  /** Time of the first frame after the load finished; null before that. */
  startedAt: () => number | null;
  isHidden: () => boolean;
  now: () => number;
}

export interface QualityLoop {
  /** One sampling step (every `SAMPLE_MS`). */
  tick: () => void;
  /** The tab was hidden or shown. */
  onVisibility: () => void;
}

/** The controller's wiring without React or a renderer: meter + store + `stepQuality`. */
export function createQualityLoop({ meter, startedAt, isHidden, now }: QualityLoopDeps): QualityLoop {
  const th = THRESHOLDS[getTier()];
  let state: QualityState | null = null;
  let forced = useQuality.getState().forceLow;

  const apply = (e: QualityEvent) => {
    if (!state) return;
    const q = useQuality.getState();
    state = stepQuality(state, e, q.ladder, th);
    if (state.stage !== q.stage) q.setStage(state.stage);
  };

  return {
    tick: () => {
      const t0 = startedAt();
      if (t0 === null) return;
      const t = now();
      if (!state) {
        state = initialQuality(t0);
        if (isHidden()) apply({ type: 'hidden', t });
      }
      const force = useQuality.getState().forceLow;
      if (force !== forced) {
        forced = force;
        apply({ type: 'override', t });
      }
      const fps = force ? FORCED_FPS : meter.average(WINDOW_SEC);
      if (fps !== null) apply({ type: 'sample', t, fps, forced: force });
    },
    onVisibility: () => {
      meter.reset();
      apply({ type: isHidden() ? 'hidden' : 'visible', t: now() });
    },
  };
}
