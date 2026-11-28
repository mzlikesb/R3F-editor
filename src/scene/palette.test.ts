import { describe, expect, it } from 'vitest';
import { PALETTE, contrastRatio, hueDistance, linearToHex, luminance, scaleHex } from './palette';

/**
 * The palette (plan 008 A.1): the selection colour must not be read as a fault, a repair, the
 * emergency light or a lit panel, and it must stand out on the ground and in the fog (#91).
 */
const MIN_HUE_GAP = 60;
const MIN_CONTRAST = 3;
/** Bloom picks pixels above this linear luminance (008-2); the selection must never glow. */
const BLOOM_THRESHOLD = 1.2;

describe('palette helpers', () => {
  it('measures hue distance the short way round', () => {
    expect(hueDistance('#ff0000', '#00ff00')).toBeCloseTo(120);
    expect(hueDistance('#ff0000', '#ff00ff')).toBeCloseTo(60);
    expect(hueDistance('#ff0000', '#ff0000')).toBeCloseTo(0);
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1);
  });

  it('turns linear RGB into hex and scales a colour in linear light', () => {
    expect(linearToHex([1, 0, 0])).toBe('#ff0000');
    expect(linearToHex([0.2159, 0.2159, 0.2159])).toBe('#808080');
    expect(scaleHex('#808080', 1)).toBe('#808080');
    expect(luminance(scaleHex('#808080', 0.5))).toBeCloseTo(luminance('#808080') * 0.5, 2);
  });
});

describe('selection colour', () => {
  const others = {
    fault: PALETTE.fault,
    repaired: PALETTE.repaired,
    statusLight: PALETTE.statusLight,
    emergency: PALETTE.emergency,
    panelOn: linearToHex(PALETTE.panelOn),
  };

  for (const [name, color] of Object.entries(others)) {
    it(`is a different hue from ${name}`, () => {
      expect(hueDistance(PALETTE.select, color)).toBeGreaterThanOrEqual(MIN_HUE_GAP);
    });
  }

  it('stands out on the ground and in the fog, also in a blackout', () => {
    expect(contrastRatio(PALETTE.select, PALETTE.ground)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(PALETTE.select, PALETTE.fog)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(PALETTE.select, scaleHex(PALETTE.fog, PALETTE.skyBlackout))).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
  });

  it('stays under the Bloom threshold', () => {
    expect(luminance(PALETTE.select)).toBeLessThan(BLOOM_THRESHOLD);
  });
});

describe('sky and fog', () => {
  it('fog is the bottom of the sky, so the ground melts into it', () => {
    expect(PALETTE.fog).toBe(PALETTE.sky[PALETTE.sky.length - 1]);
  });

  it('a blackout darkens the sky to roughly the old dark gradient', () => {
    // The blackout sky used to be its own CSS gradient: #020309 / #060b16 / #0d141f.
    const old = ['#020309', '#060b16', '#0d141f'];
    PALETTE.sky.forEach((c, i) => {
      const dark = scaleHex(c, PALETTE.skyBlackout);
      expect(Math.abs(luminance(dark) - luminance(old[i]!))).toBeLessThan(0.004);
    });
  });
});

describe('solar panel field (A.4)', () => {
  it('is quieter than before: darker face, softer frame contrast', () => {
    expect(luminance(PALETTE.panel.face)).toBeLessThanOrEqual(luminance('#16264a'));
    expect(contrastRatio(PALETTE.panel.frame, PALETTE.panel.face)).toBeLessThan(
      contrastRatio('#c9d2de', '#16264a') * 0.6,
    );
  });
});
