import { describe, expect, it } from 'vitest';
import { PALETTE, contrastRatio, hueDistance, linearToHex, luminance, mixHex, scaleHex } from './palette';

/**
 * The palette (plan 008 A.1): the selection colour must not be read as a fault, a repair, the
 * emergency light or a lit panel, and it must stand out on the ground and in the fog (#91).
 */
const MIN_HUE_GAP = 60;
const MIN_CONTRAST = 3;
// No Bloom test here: an sRGB colour's linear luminance is at most 1, under the 1.2 threshold by
// construction, and the ring and outline use plain colours (no emissive). 008-2, which adds Bloom,
// checks the rendered values against its settings.

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
    hold: PALETTE.hold,
    ping: PALETTE.ping,
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
});

describe('presence light colour (#106, #108)', () => {
  /** HSV saturation of an sRGB hex. */
  const saturation = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const max = Math.max(...c);
    return max === 0 ? 0 : (max - Math.min(...c)) / max;
  };
  const MAX_SATURATION = 0.12;
  const MIN_SATURATION_GAP = 0.15;
  const others = {
    fault: PALETTE.fault,
    repaired: PALETTE.repaired,
    statusLight: PALETTE.statusLight,
    select: PALETTE.select,
    hold: PALETTE.hold,
    panelOn: linearToHex(PALETTE.panelOn),
    ping: PALETTE.ping,
    spark: PALETTE.spark,
  };

  it('is a near-white: low saturation', () => {
    expect(saturation(PALETTE.presenceLight)).toBeLessThanOrEqual(MAX_SATURATION);
  });

  for (const [name, color] of Object.entries(others)) {
    it(`is told from ${name} by saturation`, () => {
      expect(saturation(color) - saturation(PALETTE.presenceLight)).toBeGreaterThanOrEqual(MIN_SATURATION_GAP);
    });
  }

  it('is brighter than the green status light it used to look like', () => {
    expect(luminance(PALETTE.presenceLight)).toBeGreaterThan(luminance(PALETTE.statusLight) * 1.3);
  });

  it('shows against the sky, also dimmed in a blackout', () => {
    expect(contrastRatio(PALETTE.presenceLight, PALETTE.sky[1]!)).toBeGreaterThanOrEqual(MIN_CONTRAST);
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

describe('part colour (plan 009 B.1)', () => {
  const MIN_PART_GAP = 30;
  const states = {
    fault: PALETTE.fault,
    repaired: PALETTE.repaired,
    statusLight: PALETTE.statusLight,
    select: PALETTE.select,
    hold: PALETTE.hold,
    panelOn: linearToHex(PALETTE.panelOn),
    ping: PALETTE.ping,
    spark: PALETTE.spark,
    afterglow: PALETTE.afterglow,
  };

  for (const [name, color] of Object.entries(states)) {
    it(`is a different hue from ${name}`, () => {
      expect(hueDistance(PALETTE.part, color)).toBeGreaterThanOrEqual(MIN_PART_GAP);
    });
  }

  it('is saturated where the drones are white', () => {
    const n = parseInt(PALETTE.part.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    expect((Math.max(...c) - Math.min(...c)) / Math.max(...c)).toBeGreaterThan(0.3);
  });

  it('stands out on the ground and in the blackout fog', () => {
    expect(contrastRatio(PALETTE.part, PALETTE.ground)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(PALETTE.part, scaleHex(PALETTE.fog, PALETTE.skyBlackout))).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
  });
});

describe('repair flash (#103)', () => {
  it('never passes through orange: every step from the flash to the repair green stays green-white', () => {
    for (let i = 0; i <= 10; i++) {
      const c = mixHex(PALETTE.repairFlash, PALETTE.repaired, i / 10);
      // Far from the fault red and the hold amber in hue, or too pale to have a hue.
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      expect(g).toBeGreaterThanOrEqual(r);
      expect(hueDistance(c, PALETTE.repaired)).toBeLessThan(60);
    }
  });

  it('the red to green blend it replaces did', () => {
    const mid = mixHex(PALETTE.fault, PALETTE.repaired, 0.4);
    expect(parseInt(mid.slice(1, 3), 16)).toBeGreaterThan(parseInt(mid.slice(3, 5), 16) * 0.7);
  });

  it('mixHex hits its ends', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
  });
});
