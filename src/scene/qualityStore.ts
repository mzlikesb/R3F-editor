import { create } from 'zustand';
import { buildLadder, detectTier, levelOf, type QualityLevel, type Tier } from './quality';

/** Fixed for the session (plan 007 C.9): shadows and the ladder's top come from it. */
export const TIER: Tier = detectTier({
  coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  width: window.innerWidth,
  height: window.innerHeight,
});
export const LADDER = buildLadder(TIER, window.devicePixelRatio);

export interface QualityStore extends QualityLevel {
  tier: Tier;
  /** `?perf` toggle: the controller feeds a low FPS instead of the measured one. */
  forceLow: boolean;
  setForceLow: (on: boolean) => void;
  /** Only `QualityController` calls this, with the stage `stepQuality` chose. */
  setStage: (stage: number) => void;
}

/**
 * The current quality level. The scene reads `dpr` (canvas), `asteroidFraction` (belt instance
 * count) and `outerRocksVisible` (outer ring rock cells); none of them recompiles a shader.
 */
export const useQuality = create<QualityStore>((set) => ({
  ...levelOf(LADDER, 0),
  tier: TIER,
  forceLow: false,
  setForceLow: (forceLow) => set({ forceLow }),
  setStage: (stage) => set(levelOf(LADDER, stage)),
}));
