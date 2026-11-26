/** Per-socket message rate limit (plan 003). Contract with task S in `docs/plans/003-tasks.md`. */
import { MAX_CLIENT_MESSAGES_PER_SECOND } from '../shared/protocol';

/**
 * Returns a limiter for one socket. Each call is one message at `now` (ms) and returns whether it
 * is allowed: about `limit` messages per `windowMs` (a fixed or sliding window are both fine).
 */
export function createRateLimiter(
  limit: number = MAX_CLIENT_MESSAGES_PER_SECOND,
  windowMs = 1000,
): (now: number) => boolean {
  void limit;
  void windowMs;
  throw new Error('not implemented: createRateLimiter (task S)');
}
