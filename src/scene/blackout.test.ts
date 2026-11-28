import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../../shared/protocol';
import { BLACKOUT_FADE, RELIGHT_STEP_MS, darkness, relightDelayMs, stepDaylight } from './blackout';

describe('relightDelayMs', () => {
  it('lights the modules in order, 0.15 s apart, generator first', () => {
    expect(RELIGHT_STEP_MS).toBe(150);
    expect(MODULE_IDS.map(relightDelayMs)).toEqual([0, 150, 300, 450, 600]);
  });
});

/**
 * One blackout progress for the lights, the fog and the sky (plan 008 A.3): `Lighting` steps it,
 * the fog colour and the sky brightness read `darkness` of the same value.
 */
describe('stepDaylight / darkness', () => {
  it('dims fast towards the blackout level and comes back slower', () => {
    let down = 1;
    let up = BLACKOUT_FADE.level;
    for (let i = 0; i < 6; i++) {
      down = stepDaylight(down, true, 1 / 60);
      up = stepDaylight(up, false, 1 / 60);
    }
    expect(1 - down).toBeGreaterThan(up - BLACKOUT_FADE.level);
    for (let i = 0; i < 600; i++) down = stepDaylight(down, true, 1 / 60);
    expect(down).toBeCloseTo(BLACKOUT_FADE.level, 3);
  });

  it('never overshoots on a long frame', () => {
    expect(stepDaylight(1, true, 10)).toBeCloseTo(BLACKOUT_FADE.level);
    expect(stepDaylight(BLACKOUT_FADE.level, false, 10)).toBeCloseTo(1);
  });

  it('maps the light level to 0 (daylight) .. 1 (full blackout)', () => {
    expect(darkness(1)).toBe(0);
    expect(darkness(BLACKOUT_FADE.level)).toBeCloseTo(1);
    expect(darkness((1 + BLACKOUT_FADE.level) / 2)).toBeCloseTo(0.5);
  });
});
