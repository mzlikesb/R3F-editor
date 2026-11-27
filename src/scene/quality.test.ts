import { describe, expect, it } from 'vitest';
import {
  BACKOFF_MAX_MS,
  BACKOFF_START_MS,
  COOLDOWN_MS,
  FpsMeter,
  RESUME_IGNORE_MS,
  SAMPLE_MS,
  THRESHOLDS,
  UP_HOLD_MS,
  WARMUP_MS,
  buildLadder,
  detectTier,
  initialQuality,
  levelOf,
  stepQuality,
  type Ladder,
  type QualityState,
  type Thresholds,
} from './quality';

const DESK = THRESHOLDS.desktop;
const MOBILE = THRESHOLDS.mobile;
const FULL = buildLadder('desktop', 2);

interface Run {
  state: QualityState;
  /** [time, stage] for every change. */
  changes: [number, number][];
}

/** Samples every 0.5 s from `from` (inclusive) to `to` (exclusive), FPS from the current stage. */
function run(
  start: QualityState,
  from: number,
  to: number,
  fps: (stage: number, t: number) => number,
  ladder: Ladder = FULL,
  th: Thresholds = DESK,
  forced = false,
): Run {
  let state = start;
  const changes: [number, number][] = [];
  for (let t = from; t < to; t += SAMPLE_MS) {
    const next = stepQuality(state, { type: 'sample', t, fps: fps(state.stage, t), forced }, ladder, th);
    if (next.stage !== state.stage) changes.push([t, next.stage]);
    state = next;
  }
  return { state, changes };
}

/** Change times (`times`) or stages; indexing throws instead of giving undefined. */
function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`no item ${i}`);
  return v;
}
const times = (r: Run) => r.changes.map((c) => c[0]);

/** Past the warmup, at stage 0. */
const ready = () => initialQuality(0);
const T0 = WARMUP_MS;

describe('detectTier', () => {
  it('a coarse pointer is mobile whatever the size', () => {
    expect(detectTier({ coarsePointer: true, width: 1280, height: 800 })).toBe('mobile');
  });
  it('a short side under 500 is mobile', () => {
    expect(detectTier({ coarsePointer: false, width: 1280, height: 499 })).toBe('mobile');
    expect(detectTier({ coarsePointer: false, width: 390, height: 844 })).toBe('mobile');
  });
  it('a fine pointer with both sides 500 or more is desktop', () => {
    expect(detectTier({ coarsePointer: false, width: 500, height: 500 })).toBe('desktop');
    expect(detectTier({ coarsePointer: false, width: 1280, height: 800 })).toBe('desktop');
  });
});

describe('buildLadder', () => {
  it('desktop at device dpr 2 uses every stage', () => {
    expect(buildLadder('desktop', 2)).toEqual({ stages: [0, 1, 2, 3, 4], dpr: [2, 1.25, 1, 1, 1] });
  });
  it('mobile tops out at 1.5 even on a dpr 3 phone', () => {
    expect(buildLadder('mobile', 3)).toEqual({ stages: [0, 1, 2, 3, 4], dpr: [1.5, 1.25, 1, 1, 1] });
  });
  it('never goes above the device dpr', () => {
    const l = buildLadder('desktop', 1.5);
    expect(l.dpr[0]).toBe(1.5);
    expect(Math.max(...l.dpr)).toBeLessThanOrEqual(1.5);
  });
  it('a dpr 1 device skips stages 1 and 2: the first drop goes straight to 3', () => {
    expect(buildLadder('desktop', 1)).toEqual({ stages: [0, 3, 4], dpr: [1, 1, 1, 1, 1] });
    const { changes } = run(ready(), T0, T0 + 4000, () => 20, buildLadder('desktop', 1));
    expect(changes.map((c) => c[1])).toEqual([3]);
  });
  it('skips only the stage equal to the one before it', () => {
    // 1.25: stage 1 equals stage 0, stage 2 (1) differs.
    expect(buildLadder('desktop', 1.25).stages).toEqual([0, 2, 3, 4]);
    expect(buildLadder('desktop', 1.1)).toEqual({ stages: [0, 2, 3, 4], dpr: [1.1, 1.1, 1, 1, 1] });
  });
  it('a missing device dpr counts as 1', () => {
    expect(buildLadder('mobile', 0).stages).toEqual([0, 3, 4]);
  });
});

describe('levelOf', () => {
  it('count controls come in at stages 3 and 4', () => {
    expect(levelOf(FULL, 2)).toEqual({ stage: 2, dpr: 1, asteroidFraction: 1, outerRocksVisible: true });
    expect(levelOf(FULL, 3)).toEqual({ stage: 3, dpr: 1, asteroidFraction: 0.5, outerRocksVisible: true });
    expect(levelOf(FULL, 4)).toEqual({ stage: 4, dpr: 1, asteroidFraction: 0.5, outerRocksVisible: false });
  });
});

describe('FpsMeter', () => {
  it('averages the most recent window', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 120; i++) m.push(1 / 30); // 4 s at 30
    for (let i = 0; i < 120; i++) m.push(1 / 60); // 2 s at 60
    expect(m.average(2)).toBeCloseTo(60, 5);
  });
  it('covers both rates when the window spans them', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 30; i++) m.push(1 / 30); // 1 s
    for (let i = 0; i < 60; i++) m.push(1 / 60); // 1 s
    expect(m.average(2)).toBeCloseTo(45, 5);
  });
  it('is null when empty and after reset', () => {
    const m = new FpsMeter();
    expect(m.average(2)).toBeNull();
    m.push(1 / 60);
    m.reset();
    expect(m.average(2)).toBeNull();
  });
  it('drops stalls, zero and non-finite deltas', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 60; i++) m.push(1 / 60);
    m.push(30); // a tab that was hidden
    m.push(0);
    m.push(Number.NaN);
    expect(m.average(2)).toBeCloseTo(60, 5);
  });
  it('wraps around its ring buffer', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 5000; i++) m.push(1 / 144);
    expect(m.average(2)).toBeCloseTo(144, 5);
    for (let i = 0; i < 300; i++) m.push(1 / 240);
    expect(m.average(1)).toBeCloseTo(240, 5);
  });
});

describe('stepQuality: down', () => {
  it('drops one stage after 2 s below the threshold', () => {
    const { changes } = run(ready(), T0, T0 + 1900, () => 40);
    expect(changes).toEqual([]);
    const r = run(ready(), T0, T0 + 2100, () => 40);
    expect(r.changes).toEqual([[T0 + 2000, 1]]);
  });
  it('a sample at or above the threshold restarts the hold', () => {
    const fps = (_: number, t: number) => (t === T0 + 1500 ? 50 : 40);
    const { changes } = run(ready(), T0, T0 + 3900, fps);
    expect(changes).toEqual([]);
    expect(run(ready(), T0, T0 + 4100, fps).changes).toEqual([[T0 + 4000, 1]]);
  });
  it('forced: steps down in order, no faster than the cooldown, and stops at the last stage', () => {
    const r = run(ready(), T0, T0 + 60000, () => 10, FULL, DESK, true);
    expect(r.changes.map((c) => c[1])).toEqual([1, 2, 3, 4]);
    const ts = times(r);
    for (let i = 1; i < ts.length; i++) {
      expect(at(ts, i) - at(ts, i - 1)).toBeGreaterThanOrEqual(COOLDOWN_MS);
    }
    expect(r.state.stage).toBe(4);
  });
  it('uses the mobile thresholds', () => {
    expect(run(ready(), T0, T0 + 10000, () => 30, FULL, MOBILE).changes).toEqual([]);
    expect(run(ready(), T0, T0 + 2100, () => 26, FULL, MOBILE).changes).toEqual([[T0 + 2000, 1]]);
  });
});

describe('stepQuality: warmup and hidden tab', () => {
  it('never drops during the 5 s warmup, and needs a full hold after it', () => {
    const { changes } = run(initialQuality(0), 0, WARMUP_MS + 1900, () => 5);
    expect(changes).toEqual([]);
    expect(run(initialQuality(0), 0, WARMUP_MS + 2100, () => 5).changes).toEqual([[WARMUP_MS + 2000, 1]]);
  });
  it('drops samples while hidden and for 2 s after showing again', () => {
    let s = run(ready(), T0, T0 + 1500, () => 10).state; // 1.5 s of a 2 s hold
    s = stepQuality(s, { type: 'hidden', t: T0 + 1500 }, FULL, DESK);
    let r = run(s, T0 + 1500, T0 + 30000, () => 1);
    expect(r.changes).toEqual([]);
    s = stepQuality(r.state, { type: 'visible', t: T0 + 30000 }, FULL, DESK);
    const back = T0 + 30000;
    r = run(s, back, back + RESUME_IGNORE_MS + 1900, () => 1);
    expect(r.changes).toEqual([]);
    r = run(s, back, back + RESUME_IGNORE_MS + 2100, () => 1);
    expect(r.changes).toEqual([[back + RESUME_IGNORE_MS + 2000, 1]]);
  });
  it('ignores non-finite samples', () => {
    expect(run(ready(), T0, T0 + 10000, () => Number.NaN).changes).toEqual([]);
  });
});

describe('stepQuality: up and hysteresis', () => {
  /** Dropped to stage `n` by 10 fps, then the FPS turns to `fps`. */
  function droppedTo(n: number): QualityState {
    const r = run(ready(), T0, T0 + 60000, (stage) => (stage < n ? 10 : 52), FULL, DESK, true);
    expect(r.state.stage).toBe(n);
    return stepQuality(r.state, { type: 'override', t: T0 + 60000 }, FULL, DESK);
  }

  it('goes up one stage after 6 s above the threshold, then on up to the top', () => {
    const s = droppedTo(4);
    const r = run(s, T0 + 60000, T0 + 120000, () => 60);
    expect(r.changes.map((c) => c[1])).toEqual([3, 2, 1, 0]);
    const ts = times(r);
    expect(at(ts, 0)).toBe(T0 + 66000);
    expect(at(ts, 1) - at(ts, 0)).toBeGreaterThanOrEqual(6000);
  });
  it('holds between the thresholds (no change at 50..58 short of a probe)', () => {
    const s = droppedTo(2);
    expect(run(s, T0 + 60000, T0 + 60000 + 19000, () => 55).changes).toEqual([]);
    expect(run(s, T0 + 60000, T0 + 600000, () => 51).changes).toEqual([]);
  });
  it('exact threshold values count as neither below nor above', () => {
    expect(run(ready(), T0, T0 + 30000, () => DESK.down).changes).toEqual([]);
    const s = droppedTo(4);
    // `up` is not above `up`; it is calm, so only a probe (20 s) can lift it.
    const r = run(s, T0 + 60000, T0 + 60000 + 19000, () => DESK.up);
    expect(r.changes).toEqual([]);
  });

  it('deadlock: FPS settling just under the up threshold still returns to the top', () => {
    // A transient spike dropped one stage; afterwards every stage runs at 57.
    let s = run(ready(), T0, T0 + 2100, () => 30).state;
    expect(s.stage).toBe(1);
    const r = run(s, T0 + 2100, T0 + 120000, () => 57);
    s = r.state;
    expect(s.stage).toBe(0);
    expect(r.changes).toHaveLength(1);
  });
  it('deadlock: a mobile at 44 (just under 45) returns too', () => {
    const s = run(ready(), T0, T0 + 2100, () => 20, FULL, MOBILE).state;
    expect(s.stage).toBe(1);
    expect(run(s, T0 + 2100, T0 + 120000, () => 44, FULL, MOBILE).state.stage).toBe(0);
  });

  it('no oscillation: a stage that cannot hold is retried ever more rarely', () => {
    // Stage 1 runs at 60, stage 0 at 40: every up fails.
    const end = 3600000;
    const r = run(ready(), T0, end, (stage) => (stage === 0 ? 40 : 60));
    const ups = r.changes.filter((c) => c[1] === 0).map((c) => c[0]);
    expect(ups.length).toBeGreaterThan(1);
    expect(ups.length).toBeLessThanOrEqual(12);
    for (let i = 2; i < ups.length; i++) {
      expect(at(ups, i) - at(ups, i - 1)).toBeGreaterThanOrEqual(at(ups, i - 1) - at(ups, i - 2));
    }
    // Capped: still retried within the max backoff plus a hold.
    expect(end - at(ups, ups.length - 1)).toBeLessThan(BACKOFF_MAX_MS + 30000);
  });
  it('no oscillation: the probe also backs off when the stage above fails', () => {
    // Stage 1 at 55 (calm, under up), stage 0 at 45.
    const r = run(ready(), T0, T0 + 600000, (stage) => (stage === 0 ? 45 : 55));
    const ups = r.changes.filter((c) => c[1] === 0).map((c) => c[0]);
    expect(ups.length).toBeGreaterThan(1);
    expect(ups.length).toBeLessThanOrEqual(5);
    for (let i = 2; i < ups.length; i++) {
      expect(at(ups, i) - at(ups, i - 1)).toBeGreaterThan(at(ups, i - 1) - at(ups, i - 2));
    }
  });
  it('a failed up blocks ups for the backoff, which doubles', () => {
    const r = run(ready(), T0, T0 + 200000, (stage) => (stage === 0 ? 40 : 60));
    expect(r.changes.slice(0, 4).map((c) => c[1])).toEqual([1, 0, 1, 0]);
    const ts = times(r);
    expect(at(ts, 3) - at(ts, 2)).toBeGreaterThanOrEqual(BACKOFF_START_MS);
  });
  it('no up timer runs while blocked: after the backoff a full 6 s hold is needed', () => {
    const r = run(ready(), T0, T0 + 200000, (stage) => (stage === 0 ? 40 : 60));
    const ts = times(r);
    expect(r.changes.slice(0, 4).map((c) => c[1])).toEqual([1, 0, 1, 0]);
    expect(at(ts, 3) - at(ts, 2)).toBeGreaterThanOrEqual(BACKOFF_START_MS + UP_HOLD_MS);
  });
  it('a drop long after an up is not a failure', () => {
    // Up at 60, then 70 s later the FPS falls.
    const s = run(ready(), T0, T0 + 2100, () => 30).state;
    let r = run(s, T0 + 2100, T0 + 80000, (_, t) => (t < T0 + 75000 ? 60 : 30));
    expect(r.state.stage).toBe(1);
    expect(r.state.upBlockedUntil).toBe(-Infinity);
    expect(r.state.backoffMs).toBe(BACKOFF_START_MS);
    r = run(r.state, T0 + 80000, T0 + 90000, () => 60);
    expect(r.state.stage).toBe(0);
  });

  it('override clears the failure memory', () => {
    const r = run(ready(), T0, T0 + 60000, (stage) => (stage === 0 ? 40 : 60));
    expect(r.state.backoffMs).toBeGreaterThan(BACKOFF_START_MS);
    const s = stepQuality(r.state, { type: 'override', t: T0 + 60000 }, FULL, DESK);
    expect(s.backoffMs).toBe(BACKOFF_START_MS);
    expect(s.upBlockedUntil).toBe(-Infinity);
    expect(s.stage).toBe(r.state.stage);
  });
  it('the top stage never goes up and stays calm', () => {
    expect(run(ready(), T0, T0 + 120000, () => 120).changes).toEqual([]);
  });
});

describe('stepQuality: frame-capped devices', () => {
  it('a desktop stuck at 30 fps drops once, sees no gain, goes back and stays', () => {
    const r = run(ready(), T0, T0 + 600000, () => 30);
    expect(r.changes.map((c) => c[1])).toEqual([1, 0]);
    expect(r.state.floor?.stage).toBe(0);
    expect(r.state.stage).toBe(0);
  });
  it('a mobile capped at 20 does the same', () => {
    const r = run(ready(), T0, T0 + 600000, () => 20, FULL, MOBILE);
    expect(r.changes.map((c) => c[1])).toEqual([1, 0]);
  });
  it('keeps the drops that helped and undoes the first that did not', () => {
    const byStage = [40, 45, 49, 49, 49];
    const r = run(ready(), T0, T0 + 600000, (stage) => at(byStage, stage));
    // 40 -> 45 is +12.5 %; 45 -> 49 is under +10 %, so back to 1.
    expect(r.changes.map((c) => c[1])).toEqual([1, 2, 1]);
    expect(r.state.stage).toBe(1);
  });
  it('the floor lifts once the FPS clears the up threshold', () => {
    let r = run(ready(), T0, T0 + 60000, () => 30);
    expect(r.state.floor?.stage).toBe(0);
    r = run(r.state, T0 + 60000, T0 + 70000, () => 60);
    expect(r.state.floor).toBeNull();
    // Now a load that dropping does help with is handled again.
    r = run(r.state, T0 + 70000, T0 + 90000, (stage) => (stage === 0 ? 40 : 60));
    expect(r.state.stage).toBe(1);
  });
  it('a capped device that later slows down (30 -> 20) tries one drop again, then floors anew', () => {
    let r = run(ready(), T0, T0 + 60000, () => 30);
    expect(r.state.floor).toEqual({ stage: 0, fps: 30 });
    // Under 85 % of 30 but only briefly: the floor holds.
    r = run(r.state, T0 + 60000, T0 + 61500, () => 20);
    expect(r.state.floor).not.toBeNull();
    r = run(r.state, T0 + 61500, T0 + 120000, () => 20);
    expect(r.changes.map((c) => c[1])).toEqual([1, 0]);
    expect(r.state.floor).toEqual({ stage: 0, fps: 20 });
    expect(r.state.stage).toBe(0);
  });
  it('after the floor lifts, a drop that helps is kept', () => {
    let r = run(ready(), T0, T0 + 60000, () => 30);
    r = run(r.state, T0 + 60000, T0 + 120000, (stage) => (stage === 0 ? 20 : 30));
    // 0 -> 1 helped (20 -> 30) and stays; 1 -> 2 did not (still 30 under a cap) and is undone.
    expect(r.changes.map((c) => c[1])).toEqual([1, 2, 1]);
    expect(r.state.stage).toBe(1);
    expect(r.state.floor).toEqual({ stage: 1, fps: 30 });
  });
  it('a small dip under the floor FPS (over 85 %) keeps the floor', () => {
    let r = run(ready(), T0, T0 + 60000, () => 30);
    r = run(r.state, T0 + 60000, T0 + 600000, () => 26);
    expect(r.changes).toEqual([]);
    expect(r.state.floor?.stage).toBe(0);
  });
  it('override clears the floor', () => {
    const r = run(ready(), T0, T0 + 60000, () => 30);
    const s = stepQuality(r.state, { type: 'override', t: T0 + 60000 }, FULL, DESK);
    expect(s.floor).toBeNull();
  });
});

describe('stepQuality: forced toggle round trip', () => {
  it('forced low walks down in order; released, it walks back up in order', () => {
    let forced = true;
    const fps = () => (forced ? 5 : 60);
    let r = run(ready(), T0, T0 + 30000, fps, FULL, DESK, true);
    expect(r.changes.map((c) => c[1])).toEqual([1, 2, 3, 4]);
    forced = false;
    const s = stepQuality(r.state, { type: 'override', t: T0 + 30000 }, FULL, DESK);
    r = run(s, T0 + 30000, T0 + 90000, fps);
    expect(r.changes.map((c) => c[1])).toEqual([3, 2, 1, 0]);
  });
});

describe('FpsMeter: sub-1-fps frames', () => {
  it('drops a single over-long gap (a stall)', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 120; i++) m.push(1 / 60);
    m.push(5);
    expect(m.average(2)).toBeCloseTo(60, 5);
  });

  it('counts gaps that keep coming at the cap, so the average falls under 1 fps', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 120; i++) m.push(1 / 60);
    m.push(3);
    m.push(3);
    m.push(3);
    expect(m.average(2)).toBeLessThanOrEqual(1);
  });

  it('a tab return (reset then one long gap) is still a stall', () => {
    const m = new FpsMeter();
    m.push(1 / 60);
    m.push(2);
    m.reset();
    m.push(30);
    expect(m.average(2)).toBeNull();
  });

  it('a normal frame ends the run of long gaps', () => {
    const m = new FpsMeter();
    m.push(3);
    m.push(1 / 60);
    m.push(3);
    expect(m.average(2)).toBeCloseTo(60, 5);
  });
});
