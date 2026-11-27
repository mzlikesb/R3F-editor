import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../../shared/protocol';
import { RELIGHT_STEP_MS, relightDelayMs } from './blackout';

describe('relightDelayMs', () => {
  it('lights the modules in order, 0.15 s apart, generator first', () => {
    expect(RELIGHT_STEP_MS).toBe(150);
    expect(MODULE_IDS.map(relightDelayMs)).toEqual([0, 150, 300, 450, 600]);
  });
});
