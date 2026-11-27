import { describe, expect, it } from 'vitest';
import { TAP_MAX_MOVE_PX, isTap } from './tap';

describe('isTap', () => {
  it('counts a still press as a tap', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });

  it('allows a little finger wobble', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_MAX_MOVE_PX, y: 100 })).toBe(true);
    expect(isTap({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true);
  });

  it('treats a drag (orbiting the camera) as not a tap', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_MAX_MOVE_PX + 1, y: 100 })).toBe(false);
    expect(isTap({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(false);
    expect(isTap({ x: 50, y: 50 }, { x: 10, y: 200 })).toBe(false);
  });
});
