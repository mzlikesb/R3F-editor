import { describe, expect, it } from 'vitest';
import { labelShift } from './labelClamp';

const box = (left: number, right: number, top = 300) => ({ left, right, top });

describe('labelShift', () => {
  it('leaves a label that fits alone', () => {
    expect(labelShift(box(100, 250), 390, 80)).toEqual({ dx: 0, dy: 0 });
  });

  it('pulls a label cut off on the right back in (통신탑 고장 · 눌러서…)', () => {
    expect(labelShift(box(280, 430), 390, 80)).toEqual({ dx: -48, dy: 0 });
  });

  it('pulls a label cut off on the left back in', () => {
    expect(labelShift(box(-30, 120), 390, 80)).toEqual({ dx: 38, dy: 0 });
  });

  it('a label wider than the screen keeps its left edge visible', () => {
    expect(labelShift(box(-20, 400), 390, 80).dx).toBe(28);
  });

  it('moves a label that sits under the HUD down below it', () => {
    expect(labelShift(box(100, 250, 40), 1280, 100)).toEqual({ dx: 0, dy: 68 });
  });

  it('no HUD (not shown yet) means no vertical shift', () => {
    expect(labelShift(box(100, 250, -20), 1280, 0).dy).toBe(0);
  });
});
