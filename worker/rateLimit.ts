/** Per-socket message rate limit (plans 003, 006 A.10). Track `server` implements the TODO body. */
import { MAX_CLIENT_MESSAGES_PER_SECOND, type ClientMessage } from '../shared/protocol';

/**
 * Returns a limiter for one socket. Each call is one message at `now` (ms) and returns whether it
 * is allowed: about `limit` messages per `windowMs` (a fixed or sliding window are both fine).
 */
export function createRateLimiter(
  limit: number = MAX_CLIENT_MESSAGES_PER_SECOND,
  windowMs = 1000,
): (now: number) => boolean {
  /** Sliding window: timestamps of allowed messages. */
  const allowed: number[] = [];
  return (now) => {
    while (allowed.length > 0 && now - allowed[0]! >= windowMs) allowed.shift();
    if (allowed.length >= limit) return false;
    allowed.push(now);
    return true;
  };
}

/**
 * Whether a parsed message is handled (plan 006 A.10): `release` always, without using the
 * socket's budget, so a hold is never stuck by the limit; `hold`, `repair` and `collect` (plan 009
 * A.6) only when `allow(now)`.
 * A `hold` turned away here is not recorded as a hold (neon (b)).
 */
export function admit(type: ClientMessage['type'], allow: (now: number) => boolean, now: number): boolean {
  if (type === 'release') return true;
  return allow(now);
}
