import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  POST_OFF,
  buildLadder,
  detectTier,
  levelOf,
  sanitizeDpr,
  type Ladder,
  type QualityLevel,
  type Tier,
} from './quality';

/** The slice of `MediaQueryList` used here (this file is also type-checked without the DOM lib). */
export interface MediaQueryLike {
  matches: boolean;
  addEventListener: (type: 'change', listener: () => void) => void;
  removeEventListener: (type: 'change', listener: () => void) => void;
}

/** The bits of `window` the quality store reads; all optional so a test environment can lack them. */
export interface DeviceWindow {
  innerWidth?: number;
  innerHeight?: number;
  devicePixelRatio?: number;
  matchMedia?: (query: string) => MediaQueryLike;
}

const browserWindow = (): DeviceWindow | undefined => (globalThis as { window?: DeviceWindow }).window;

export function readTier(win: DeviceWindow | undefined): Tier {
  return detectTier({
    coarsePointer: win?.matchMedia?.('(pointer: coarse)').matches ?? false,
    width: win?.innerWidth ?? 1280,
    height: win?.innerHeight ?? 720,
  });
}

let tier: Tier | null = null;
/** Fixed for the session (plan 007 C.9): shadows and the ladder's top come from it. Read on first use. */
export function getTier(): Tier {
  tier ??= readTier(browserWindow());
  return tier;
}

/**
 * Calls `onChange` with the new `devicePixelRatio` every time it changes (window moved to another
 * monitor, browser zoom). The media query names the current ratio, so it is built again after
 * each change. Returns the stop function; does nothing without `matchMedia`.
 */
export function watchDevicePixelRatio(win: DeviceWindow, onChange: (dpr: number) => void): () => void {
  if (typeof win.matchMedia !== 'function') return () => {};
  let mq: MediaQueryLike | null = null;
  const arm = () => {
    mq = win.matchMedia!(`(resolution: ${sanitizeDpr(win.devicePixelRatio)}dppx)`);
    mq.addEventListener('change', onMediaChange);
  };
  const onMediaChange = () => {
    mq?.removeEventListener('change', onMediaChange);
    onChange(sanitizeDpr(win.devicePixelRatio));
    arm();
  };
  arm();
  return () => mq?.removeEventListener('change', onMediaChange);
}

export interface QualityStore extends QualityLevel {
  tier: Tier;
  /** Stages and their dpr for this device ratio; rebuilt when the ratio changes. */
  ladder: Ladder;
  /** `?perf` toggle: the controller feeds a low FPS instead of the measured one. */
  forceLow: boolean;
  setForceLow: (on: boolean) => void;
  /** Only `QualityController` calls this, with the stage `stepQuality` chose. */
  setStage: (stage: number) => void;
  /** The device's pixel ratio changed: the ladder's dpr caps follow, the stage stays. */
  setDeviceDpr: (dpr: number) => void;
  /**
   * Post-processing axis (008 R3), `POST_FULL`..`POST_OFF`. `POST_OFF` until the session picks the
   * composer; then only `QualityController` (one way down) and a composer failure move it.
   */
  post: number;
  setPost: (post: number) => void;
}

function createQualityStore(): UseBoundStore<StoreApi<QualityStore>> {
  const t = getTier();
  const ladder = buildLadder(t, browserWindow()?.devicePixelRatio ?? 1);
  return create<QualityStore>((set, get) => ({
    ...levelOf(ladder, 0),
    tier: t,
    ladder,
    forceLow: false,
    post: POST_OFF,
    setPost: (post) => set({ post }),
    setForceLow: (forceLow) => set({ forceLow }),
    setStage: (stage) => set(levelOf(get().ladder, stage)),
    setDeviceDpr: (dpr) => {
      const next = buildLadder(get().tier, dpr);
      set({ ladder: next, ...levelOf(next, get().stage) });
    },
  }));
}

let store: UseBoundStore<StoreApi<QualityStore>> | null = null;
const getStore = () => (store ??= createQualityStore());

/**
 * The current quality level. The scene reads `dpr` (canvas), `asteroidFraction` (belt instance
 * count) and `outerRocksVisible` (outer ring rock cells); none of them recompiles a shader.
 * The store is built on first use, not when the module is imported.
 */
export const useQuality = Object.assign(<T>(selector: (s: QualityStore) => T): T => getStore()(selector), {
  getState: () => getStore().getState(),
  setState: ((...args: Parameters<StoreApi<QualityStore>['setState']>) =>
    getStore().setState(...args)) as StoreApi<QualityStore>['setState'],
  subscribe: ((...args: Parameters<StoreApi<QualityStore>['subscribe']>) =>
    getStore().subscribe(...args)) as StoreApi<QualityStore>['subscribe'],
});

/** Test hook: drops the cached tier and store so the next use reads the environment again. */
export function resetQualityStoreForTest(): void {
  tier = null;
  store = null;
}
