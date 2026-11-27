import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTier,
  readTier,
  resetQualityStoreForTest,
  useQuality,
  watchDevicePixelRatio,
  type DeviceWindow,
  type MediaQueryLike,
} from './qualityStore';

afterEach(() => {
  vi.unstubAllGlobals();
  resetQualityStoreForTest();
});

/** A matchMedia whose queries can be fired by hand. */
function fakeWindow(dpr: number) {
  const listeners = new Map<string, Set<() => void>>();
  const win: DeviceWindow = {
    devicePixelRatio: dpr,
    innerWidth: 1280,
    innerHeight: 720,
    matchMedia: (query: string) =>
      ({
        matches: false,
        addEventListener: (_: 'change', fn: () => void) => {
          if (!listeners.has(query)) listeners.set(query, new Set());
          listeners.get(query)!.add(fn);
        },
        removeEventListener: (_: 'change', fn: () => void) => listeners.get(query)?.delete(fn),
      }) satisfies MediaQueryLike,
  };
  const fire = (query: string) => [...(listeners.get(query) ?? [])].forEach((fn) => fn());
  return { win, listeners, fire };
}

describe('module import and first use without matchMedia', () => {
  it('importing the module needs no window (this environment has none)', () => {
    expect('window' in globalThis).toBe(false);
  });

  it('reads defaults when window or matchMedia is missing', () => {
    expect(readTier(undefined)).toBe('desktop');
    expect(readTier({})).toBe('desktop');
    expect(getTier()).toBe('desktop');
    expect(useQuality.getState().dpr).toBe(1);
  });

  it('builds the store on first use, from the then-current window', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2, innerWidth: 1280, innerHeight: 720 });
    expect(useQuality.getState().dpr).toBe(2);
  });
});

describe('watchDevicePixelRatio', () => {
  it('reports the new ratio and watches again for the next change', () => {
    const { win, fire } = fakeWindow(2);
    const seen: number[] = [];
    watchDevicePixelRatio(win, (d) => seen.push(d));
    win.devicePixelRatio = 1;
    fire('(resolution: 2dppx)');
    win.devicePixelRatio = 1.5;
    fire('(resolution: 1dppx)');
    expect(seen).toEqual([1, 1.5]);
  });

  it('stop removes the listener', () => {
    const { win, listeners, fire } = fakeWindow(2);
    const seen: number[] = [];
    const stop = watchDevicePixelRatio(win, (d) => seen.push(d));
    stop();
    fire('(resolution: 2dppx)');
    expect(seen).toEqual([]);
    expect(listeners.get('(resolution: 2dppx)')?.size).toBe(0);
  });

  it('does nothing without matchMedia', () => {
    expect(() => watchDevicePixelRatio({}, () => {})()).not.toThrow();
  });
});

describe('setDeviceDpr', () => {
  it('lowers the cap when the window moves to a 1x monitor, keeping the stage', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2, innerWidth: 1280, innerHeight: 720 });
    const q = useQuality.getState();
    expect(q.dpr).toBe(2);
    q.setDeviceDpr(1);
    expect(useQuality.getState().dpr).toBe(1);
    expect(useQuality.getState().stage).toBe(0);
  });

  it('raises it again on a 2x monitor, and keeps a dropped stage', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
    const q = useQuality.getState();
    q.setStage(2);
    q.setDeviceDpr(2);
    const s = useQuality.getState();
    expect(s.stage).toBe(2);
    expect(s.dpr).toBe(1);
    s.setStage(0);
    expect(useQuality.getState().dpr).toBe(2);
  });
});
