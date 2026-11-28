/**
 * The chromatic aberration hit when the lights go out (plan 008 C.3, R6). Pure: the store stamps
 * the time of a live blackout start, `post/PostStack.tsx` turns the elapsed time into an offset.
 */

/** Where the blackout came from: a live `fault` message, or a snapshot (join, reconnect, REST). */
export type BlackoutSource = 'live' | 'snapshot';

/** Only a normal -> blackout change seen live. A snapshot that is already dark never fires. */
export function chromaPulse(prev: boolean, next: boolean, source: BlackoutSource): boolean {
  return source === 'live' && !prev && next;
}

/** Seconds the pulse lasts. */
export const CHROMA_S = 0.4;
/** Offset (a fraction of the screen) at the moment the lights go out. */
export const CHROMA_PEAK = 0.012;

/** The `?perf` "slow" toggle's pulse length, to see it at all (debug only). */
export const CHROMA_SLOW_S = 2;

/** Full strength at 0, eased down to 0 at `durationS`; 0 outside the pulse. */
export function chromaAmount(elapsedS: number, durationS: number = CHROMA_S): number {
  if (!(elapsedS >= 0) || elapsedS >= durationS) return 0;
  const k = 1 - elapsedS / durationS;
  return CHROMA_PEAK * k * k;
}

/**
 * The `?perf` panel's "정전 효과" button (#108): a pulse on this client only. It touches neither the
 * store nor the server; `at` is a `performance.now()` time, `slow` the debug-only 2 s length.
 */
export const chromaDebug: { at: number | null; slow: boolean } = { at: null, slow: false };

export function triggerChromaDebug(now: number): void {
  chromaDebug.at = now;
}

/** The offset at `now` (ms): the live blackout start (`liveAt`, from the store) or the debug pulse. */
export function chromaOffsetAt(now: number, liveAt: number | null): number {
  const live = liveAt === null ? 0 : chromaAmount((now - liveAt) / 1000);
  const { at, slow } = chromaDebug;
  const debug = at === null ? 0 : chromaAmount((now - at) / 1000, slow ? CHROMA_SLOW_S : CHROMA_S);
  return Math.max(live, debug);
}
