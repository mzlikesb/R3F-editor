import { describe, expect, it } from 'vitest';
import {
  POST_FULL,
  POST_NO_AO,
  POST_NO_BLOOM,
  POST_OFF,
  SAMPLE_MS,
  THRESHOLDS,
  WARMUP_MS,
  buildLadder,
  initialQuality,
  stepQuality,
  type QualityState,
} from './quality';

/**
 * The post-processing axis of the quality ladder (008 R3). Two axes: post-processing goes one way
 * (N8AO off, Bloom off, composer off) and never comes back in the session; resolution and geometry
 * (stages 0-4) keep their two-way rules. Order on a slow device: N8AO first, then stages 0-4, then
 * Bloom, then the composer.
 */

const DESK = THRESHOLDS.desktop;
const FULL = buildLadder('desktop', 2);
const T0 = WARMUP_MS;

type Fps = (s: QualityState) => number;

interface Run {
  state: QualityState;
  /** [stage, post] after every change of either. */
  steps: [number, number][];
}

function run(start: QualityState, from: number, to: number, fps: Fps): Run {
  let state = start;
  const steps: [number, number][] = [];
  for (let t = from; t < to; t += SAMPLE_MS) {
    const next = stepQuality(state, { type: 'sample', t, fps: fps(state) }, FULL, DESK);
    if (next.stage !== state.stage || next.post !== state.post) steps.push([next.stage, next.post]);
    state = next;
  }
  return { state, steps };
}

/** Every step down (either axis) buys 20%, so no stage drop is undone as useless. */
const scaling =
  (base: number): Fps =>
  (s) =>
    base * 1.2 ** (s.stage + s.post);

describe('quality ladder, post-processing axis (008 R3)', () => {
  it('a composer session starts with everything on; a plain session starts with the axis spent', () => {
    expect(initialQuality(0, POST_FULL).post).toBe(POST_FULL);
    expect(initialQuality(0).post).toBe(POST_OFF);
  });

  it('a slow device goes N8AO -> stages 1-4 -> Bloom -> composer, one step at a time', () => {
    const { steps, state } = run(initialQuality(0, POST_FULL), T0, T0 + 120_000, scaling(15));
    expect(steps).toEqual([
      [0, POST_NO_AO],
      [1, POST_NO_AO],
      [2, POST_NO_AO],
      [3, POST_NO_AO],
      [4, POST_NO_AO],
      [4, POST_NO_BLOOM],
      [4, POST_OFF],
    ]);
    expect(state.post).toBe(POST_OFF);
  });

  it('post-processing never comes back; the resolution axis does', () => {
    const slow = run(initialQuality(0, POST_FULL), T0, T0 + 120_000, scaling(15));
    expect(slow.state).toMatchObject({ stage: 4, post: POST_OFF });
    const fast = run(slow.state, T0 + 120_000, T0 + 400_000, () => 120);
    expect(fast.state.stage).toBe(0);
    expect(fast.state.post).toBe(POST_OFF);
    expect(fast.steps.every(([, post]) => post === POST_OFF)).toBe(true);
  });

  it('after N8AO alone fixes it, the stages are untouched and N8AO stays off', () => {
    // 45 fps with N8AO, 60 without.
    const { state, steps } = run(initialQuality(0, POST_FULL), T0, T0 + 200_000, (s) =>
      s.post >= POST_NO_AO ? 60 : 45,
    );
    expect(steps).toEqual([[0, POST_NO_AO]]);
    expect(state).toMatchObject({ stage: 0, post: POST_NO_AO });
  });

  it('a post step that buys nothing is kept (no undo on this axis)', () => {
    // Frame-capped: nothing helps. N8AO goes and stays gone; the stage drop after it is undone as before.
    const { state } = run(initialQuality(0, POST_FULL), T0, T0 + 60_000, () => 30);
    expect(state.post).toBe(POST_NO_AO);
    expect(state.stage).toBe(0);
  });

  it('Bloom and the composer only go once the stages are at the bottom', () => {
    const { steps } = run(initialQuality(0, POST_FULL), T0, T0 + 120_000, scaling(15));
    for (const [stage, post] of steps) if (post >= POST_NO_BLOOM) expect(stage).toBe(4);
  });

  it('a plain session skips the post axis: only stages move', () => {
    const { steps, state } = run(initialQuality(0), T0, T0 + 120_000, scaling(15));
    expect(steps.map(([stage]) => stage)).toEqual([1, 2, 3, 4]);
    expect(state.post).toBe(POST_OFF);
  });

  it('a post event (the composer failed, the session went plain) raises the axis and never lowers it', () => {
    const s = initialQuality(0, POST_FULL);
    const off = stepQuality(s, { type: 'post', level: POST_OFF }, FULL, DESK);
    expect(off.post).toBe(POST_OFF);
    expect(stepQuality(off, { type: 'post', level: POST_FULL }, FULL, DESK).post).toBe(POST_OFF);
  });
});
