import { describe, expect, it } from 'vitest';
import { parseLook } from './lookParse';

describe('parseLook', () => {
  it('reads budget and max, anything else is none', () => {
    expect(parseLook('?look=budget')).toBe('budget');
    expect(parseLook('?perf&look=max')).toBe('max');
    expect(parseLook('?look=x')).toBe('none');
    expect(parseLook('')).toBe('none');
  });
});
