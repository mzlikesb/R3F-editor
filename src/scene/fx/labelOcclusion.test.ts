import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../layout';
import { OVERVIEW_START } from '../layout';
import { isLabelOccluded } from './labelOcclusion';

const [cx, cy, cz] = OVERVIEW_START;

describe('isLabelOccluded: a label of a module hidden behind another is faint', () => {
  it('nothing is hidden from the overview camera (high and in front)', () => {
    for (const id of Object.keys(LAYOUT) as (keyof typeof LAYOUT)[]) {
      expect(isLabelOccluded(id, cx, cy, cz)).toBe(false);
    }
  });

  it('the generator is hidden when the comms tower stands between it and a low camera', () => {
    const c = LAYOUT.comms;
    // A camera out past the tower, low, on the line from the generator (the origin) through it.
    expect(isLabelOccluded('generator', c.x * 2, 1, c.z * 2)).toBe(true);
  });

  it('the tower itself is not hidden from that camera', () => {
    const c = LAYOUT.comms;
    expect(isLabelOccluded('comms', c.x * 2, 1, c.z * 2)).toBe(false);
  });

  it('a camera high above looks over the module in front', () => {
    const c = LAYOUT.comms;
    expect(isLabelOccluded('generator', c.x * 2, 40, c.z * 2)).toBe(false);
  });

  it('a camera standing right on the module (no distance) is not hidden', () => {
    const g = LAYOUT.generator;
    expect(isLabelOccluded('generator', g.x, 5, g.z)).toBe(false);
  });
});
