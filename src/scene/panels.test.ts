import { describe, expect, it } from 'vitest';
import { LAYOUT } from './layout';
import {
  LIGHT_OFF,
  LIGHT_ON,
  PANELS,
  RELIGHT_MS,
  createPanelLights,
  relightDelays,
  stepPanelLights,
  type PanelLights,
} from './panels';

/**
 * Panel lights in a blackout (plan 007 A.2): off all at once, back on from the generator outwards
 * over `RELIGHT_MS`, and the colour buffer is only touched inside that window.
 */

const points = [
  { x: 0, z: 30 },
  { x: 0, z: 15 },
  { x: 10, z: 20 },
  { x: -3, z: 40 },
];

function is(colors: Float32Array, i: number, rgb: readonly number[]): boolean {
  return [0, 1, 2].every((k) => colors[i * 3 + k] === Math.fround(rgb[k]!));
}

const lit = (colors: Float32Array, i: number) => is(colors, i, LIGHT_ON);
const dark = (colors: Float32Array, i: number) => is(colors, i, LIGHT_OFF);

function setup(): PanelLights {
  return createPanelLights(relightDelays(points, LAYOUT.generator));
}

describe('relightDelays', () => {
  it('grows with distance from the generator, from 0 to RELIGHT_MS', () => {
    const d = relightDelays(points, { x: 0, z: 0 });
    expect(d[1]).toBe(0); // nearest
    expect(d[3]).toBeCloseTo(RELIGHT_MS, 6); // farthest
    expect(d[1]).toBeLessThan(d[2]!);
    expect(d[2]).toBeLessThan(d[0]!);
    expect(d[0]).toBeLessThan(d[3]!);
  });

  it('is about 1.5 s for the whole field', () => {
    expect(RELIGHT_MS).toBe(1500);
    const d = relightDelays(PANELS, LAYOUT.generator);
    expect(Math.max(...d)).toBeCloseTo(RELIGHT_MS, 6);
    expect(Math.min(...d)).toBe(0);
  });
});

describe('stepPanelLights', () => {
  it('starts lit and leaves the buffer alone while the power is on', () => {
    const s = setup();
    for (let i = 0; i < points.length; i++) expect(lit(s.colors, i)).toBe(true);
    for (let t = 0; t < 5000; t += 16) expect(stepPanelLights(s, false, t)).toBe(false);
  });

  it('goes dark all at once on a blackout, then stops writing', () => {
    const s = setup();
    expect(stepPanelLights(s, true, 100)).toBe(true);
    for (let i = 0; i < points.length; i++) expect(dark(s.colors, i)).toBe(true);
    for (let t = 116; t < 5000; t += 16) expect(stepPanelLights(s, true, t)).toBe(false);
  });

  it('starts dark when the page opens during a blackout', () => {
    const s = setup();
    expect(stepPanelLights(s, true, 0)).toBe(true);
    for (let i = 0; i < points.length; i++) expect(dark(s.colors, i)).toBe(true);
  });

  it('relights nearest first, each panel once its delay has passed', () => {
    const s = setup();
    stepPanelLights(s, true, 0);
    const start = 1000;
    const order: number[] = [];
    for (let t = start; t <= start + RELIGHT_MS + 100; t += 16) {
      stepPanelLights(s, false, t);
      for (let i = 0; i < points.length; i++) {
        const due = s.delays[i]! <= t - start;
        expect(lit(s.colors, i), `panel ${i} at +${t - start} ms`).toBe(due);
        if (due && !order.includes(i)) order.push(i);
      }
    }
    expect(order).toEqual([1, 2, 0, 3]);
  });

  it('writes only inside the relight window, and not again after it', () => {
    const s = setup();
    stepPanelLights(s, true, 0);
    let writes = 0;
    let lastWrite = -1;
    const start = 2000;
    for (let t = start; t < start + 6000; t += 16) {
      if (stepPanelLights(s, false, t)) {
        writes += 1;
        lastWrite = t;
      }
    }
    expect(writes).toBeGreaterThan(0);
    expect(lastWrite - start).toBeLessThanOrEqual(RELIGHT_MS + 16);
    for (let i = 0; i < points.length; i++) expect(lit(s.colors, i)).toBe(true);
    expect(s.phase).toBe('on');
  });

  it('a frame inside the window that lights nothing new asks for no upload', () => {
    // Two far-apart panels: nothing is due between them.
    const s = createPanelLights(
      relightDelays(
        [
          { x: 0, z: 15 },
          { x: 0, z: 45 },
        ],
        { x: 0, z: 0 },
      ),
    );
    stepPanelLights(s, true, 0);
    expect(stepPanelLights(s, false, 100)).toBe(true); // the near one
    expect(stepPanelLights(s, false, 700)).toBe(false);
    expect(stepPanelLights(s, false, 100 + RELIGHT_MS)).toBe(true); // the far one
    expect(stepPanelLights(s, false, 200 + RELIGHT_MS)).toBe(false);
  });

  it('a blackout during the relight turns everything off again', () => {
    const s = setup();
    stepPanelLights(s, true, 0);
    stepPanelLights(s, false, 100);
    stepPanelLights(s, false, 100 + RELIGHT_MS / 2);
    expect(stepPanelLights(s, true, 100 + RELIGHT_MS / 2 + 16)).toBe(true);
    for (let i = 0; i < points.length; i++) expect(dark(s.colors, i)).toBe(true);
    expect(s.phase).toBe('off');
  });
});
