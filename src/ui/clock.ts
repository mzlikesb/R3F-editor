/**
 * One wall clock for every ticking piece of UI (HUD uptime, last repair, record card). Each piece
 * used to run its own `setInterval`, so the same moment read `18초` in the HUD and `17초` in the
 * record card (#80). Now one interval fires every subscriber with the same `now`, and anything that
 * paints on mount reads the same cached value.
 */

export const CLOCK_TICK_MS = 1000;

type Listener = (now: number) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = 0;

/** The time of the last shared tick; `Date.now()` while nobody is subscribed. */
export function clockNow(): number {
  return timer === null ? Date.now() : current;
}

/** Calls `fn` with the shared time right away and on every tick. Returns the unsubscribe. */
export function subscribeClock(fn: Listener): () => void {
  if (timer === null) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const l of [...listeners]) l(current);
    }, CLOCK_TICK_MS);
  }
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}
