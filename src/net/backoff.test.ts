import { describe, expect, it } from 'vitest';
import { MAX_RECONNECT_DELAY_MS, reconnectDelayMs } from './backoff';

describe('reconnectDelayMs', () => {
  it('caps at 10 seconds', () => {
    expect(MAX_RECONNECT_DELAY_MS).toBe(10_000);
    for (const r of [0, 0.5, 0.999]) {
      for (let attempt = 0; attempt < 30; attempt++) {
        expect(reconnectDelayMs(attempt, () => r)).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
      }
    }
  });

  it('starts short and grows toward the cap', () => {
    const at = (n: number) => reconnectDelayMs(n, () => 0.5);
    expect(at(0)).toBeGreaterThan(0);
    expect(at(0)).toBeLessThan(2000);
    for (let n = 1; n < 30; n++) expect(at(n)).toBeGreaterThanOrEqual(at(n - 1));
    expect(at(20)).toBeGreaterThanOrEqual(MAX_RECONNECT_DELAY_MS / 2);
  });
});
