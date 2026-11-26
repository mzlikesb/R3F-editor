/** Reconnect backoff (plan 003). Contract with task C in `docs/plans/003-tasks.md`. */

/** Reconnect delays never exceed this. */
export const MAX_RECONNECT_DELAY_MS = 10_000;

/**
 * Delay before reconnect attempt `attempt` (0 = first retry). Grows exponentially up to
 * `MAX_RECONNECT_DELAY_MS`. `rand` ([0, 1)) may add jitter.
 */
export function reconnectDelayMs(attempt: number, rand: () => number = Math.random): number {
  void attempt;
  void rand;
  throw new Error('not implemented: reconnectDelayMs (task C)');
}
