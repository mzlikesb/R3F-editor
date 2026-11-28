import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOWN_HOLD_MS, FpsMeter, POST_FULL, POST_NO_AO, POST_OFF, SAMPLE_MS, WARMUP_MS } from './quality';
import { FORCED_FPS, createQualityLoop } from './qualityLoop';
import { resetQualityStoreForTest, useQuality } from './qualityStore';

beforeEach(() => resetQualityStoreForTest());
afterEach(() => resetQualityStoreForTest());

function setup(opts: { hidden?: boolean; started?: number | null } = {}) {
  const meter = new FpsMeter();
  const env = { t: 0, hidden: opts.hidden ?? false, started: opts.started === undefined ? 0 : opts.started };
  const loop = createQualityLoop({
    meter,
    startedAt: () => env.started,
    isHidden: () => env.hidden,
    now: () => env.t,
  });
  /** Feeds `fps` frames and ticks every SAMPLE_MS until `until`. */
  const runTo = (until: number, fps: number) => {
    while (env.t < until) {
      for (let i = 0; i < fps * (SAMPLE_MS / 1000); i++) meter.push(1 / fps);
      env.t += SAMPLE_MS;
      loop.tick();
    }
  };
  return { meter, env, loop, runTo };
}

describe('createQualityLoop', () => {
  it('does nothing before the load finished', () => {
    const { runTo } = setup({ started: null });
    runTo(WARMUP_MS + DOWN_HOLD_MS + 5000, 10);
    expect(useQuality.getState().stage).toBe(0);
  });

  it('starts measuring on the first tick after load: warmup, then a slow device drops a stage', () => {
    const { runTo } = setup();
    runTo(WARMUP_MS - SAMPLE_MS, 10);
    expect(useQuality.getState().stage).toBe(0);
    runTo(WARMUP_MS + DOWN_HOLD_MS + 2 * SAMPLE_MS, 10);
    expect(useQuality.getState().stage).toBeGreaterThan(0);
  });

  it('a composer session (post axis open at load) drops N8AO before any stage (008 R3)', () => {
    useQuality.getState().setPost(POST_FULL);
    const { runTo } = setup();
    runTo(WARMUP_MS + DOWN_HOLD_MS + 2 * SAMPLE_MS, 10);
    expect(useQuality.getState()).toMatchObject({ stage: 0, post: POST_NO_AO });
  });

  it('the composer failing later (store post set to off) is taken up by the loop and stays', () => {
    useQuality.getState().setPost(POST_FULL);
    const { runTo } = setup();
    runTo(WARMUP_MS, 60);
    useQuality.getState().setPost(POST_OFF);
    runTo(WARMUP_MS + DOWN_HOLD_MS + 3000, 10);
    expect(useQuality.getState().post).toBe(POST_OFF);
    expect(useQuality.getState().stage).toBeGreaterThan(0);
  });

  it('a tab already hidden at the start never drops, and shows up again with a fresh warmup', () => {
    const { env, loop, runTo } = setup({ hidden: true });
    runTo(WARMUP_MS + DOWN_HOLD_MS + 5000, 10);
    expect(useQuality.getState().stage).toBe(0);
    env.hidden = false;
    loop.onVisibility();
    runTo(env.t + 1500, 10);
    expect(useQuality.getState().stage).toBe(0);
  });

  it('hiding the tab clears the meter', () => {
    const { env, meter, loop } = setup();
    meter.push(1 / 60);
    env.hidden = true;
    loop.onVisibility();
    expect(meter.average(2)).toBeNull();
  });

  it('the forced toggle feeds FORCED_FPS and lowers the stage; releasing it restores nothing by itself', () => {
    const { runTo } = setup();
    runTo(WARMUP_MS, 60);
    useQuality.getState().setForceLow(true);
    expect(FORCED_FPS).toBeLessThan(27);
    runTo(WARMUP_MS + DOWN_HOLD_MS + 3000, 60);
    expect(useQuality.getState().stage).toBeGreaterThan(0);
  });

  it('a ladder rebuilt for a new dpr is the one the loop steps on', () => {
    const { runTo } = setup();
    runTo(WARMUP_MS, 60);
    useQuality.getState().setDeviceDpr(1);
    runTo(WARMUP_MS + DOWN_HOLD_MS + 3000, 10);
    expect(useQuality.getState().stage).toBeGreaterThan(0);
    expect(useQuality.getState().dpr).toBe(1);
  });

  it('sub-1-fps frames still drop a stage', () => {
    const { env, meter, loop } = setup();
    env.t = 0;
    loop.tick(); // init at t0
    let deepest = 0;
    for (let t = SAMPLE_MS; t < WARMUP_MS + DOWN_HOLD_MS + 6000; t += SAMPLE_MS) {
      env.t = t;
      if (t % 2000 === 0) meter.push(2.5);
      loop.tick();
      deepest = Math.max(deepest, useQuality.getState().stage);
    }
    // The drop is checked later (a drop that buys nothing is undone), but it is tried.
    expect(deepest).toBeGreaterThan(0);
  });

  it('a drop that speeds sub-1-fps frames up (2.5 s -> 1.25 s) is kept, not undone and floored', () => {
    const { env, meter, loop } = setup();
    env.t = 0;
    loop.tick();
    let next = 0;
    for (let t = SAMPLE_MS; t < WARMUP_MS + DOWN_HOLD_MS + 30000; t += SAMPLE_MS) {
      env.t = t;
      // Codex's case (#93): any lower stage speeds the frames from 2.5 s to 1.25 s, both over 1 s.
      const frame = useQuality.getState().stage === 0 ? 2.5 : 1.25;
      if (t >= next) {
        meter.push(frame);
        next = t + frame * 1000;
      }
      loop.tick();
    }
    expect(useQuality.getState().stage).toBeGreaterThan(0);
  });
});
