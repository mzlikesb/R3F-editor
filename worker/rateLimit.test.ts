import { describe, expect, it } from 'vitest';
import { MAX_CLIENT_MESSAGES_PER_SECOND } from '../shared/protocol';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows 5 messages in a second and ignores the 6th', () => {
    expect(MAX_CLIENT_MESSAGES_PER_SECOND).toBe(5);
    const allow = createRateLimiter();
    const results = [0, 100, 200, 300, 400, 500].map((t) => allow(t));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it('allows messages again once the second has passed', () => {
    const allow = createRateLimiter();
    for (let i = 0; i < 6; i++) allow(i);
    expect(allow(10)).toBe(false);
    expect(allow(2100)).toBe(true);
  });

  it('keeps limits separate per socket', () => {
    const a = createRateLimiter();
    const b = createRateLimiter();
    for (let i = 0; i < 5; i++) a(i);
    expect(a(5)).toBe(false);
    expect(b(5)).toBe(true);
  });

  it('allows a steady 4 per second indefinitely', () => {
    const allow = createRateLimiter();
    for (let t = 0; t < 10_000; t += 250) expect(allow(t)).toBe(true);
  });
});
