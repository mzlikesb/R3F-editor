import { describe, expect, it } from 'vitest';
import { MAX_CLIENT_MESSAGES_PER_SECOND } from '../shared/protocol';
import { admit, createRateLimiter } from './rateLimit';

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

describe('admit (plan 006 A.10, neon (b))', () => {
  it('limits hold and repair, never release', () => {
    const allow = createRateLimiter();
    const results = [0, 1, 2, 3, 4].map((t) => admit('hold', allow, t));
    expect(results).toEqual([true, true, true, true, true]);
    expect(admit('hold', allow, 5)).toBe(false);
    expect(admit('repair', allow, 6)).toBe(false);
    expect(admit('release', allow, 7)).toBe(true);
  });

  it('limits collect too, sharing the budget with hold and repair (plan 009 A.6)', () => {
    const allow = createRateLimiter();
    for (let t = 0; t < 4; t++) expect(admit('collect', allow, t)).toBe(true);
    expect(admit('repair', allow, 4)).toBe(true);
    expect(admit('collect', allow, 5)).toBe(false);
    expect(admit('collect', allow, 1000)).toBe(true);
  });

  it('a release does not use up the budget', () => {
    const allow = createRateLimiter();
    for (let t = 0; t < 10; t++) expect(admit('release', allow, t)).toBe(true);
    for (let t = 10; t < 15; t++) expect(admit('hold', allow, t)).toBe(true);
    expect(admit('hold', allow, 15)).toBe(false);
  });
});
