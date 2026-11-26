/** Reconnect backoff (plan 003). Contract with task C in `docs/plans/003-tasks.md`. */

/** Reconnect delays never exceed this. */
export const MAX_RECONNECT_DELAY_MS = 10_000;

/**
 * Delay before reconnect attempt `attempt` (0 = first retry). Grows exponentially up to
 * `MAX_RECONNECT_DELAY_MS`. `rand` ([0, 1)) may add jitter.
 */
export function reconnectDelayMs(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** Math.min(Math.max(attempt, 0), 30));
  // Jitter keeps clients from reconnecting in lockstep: 75%..100% of the step.
  return Math.round(base * (0.75 + 0.25 * rand()));
}
