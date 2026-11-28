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

/** Full strength at 0, eased down to 0 at `CHROMA_S`; 0 outside the pulse. */
export function chromaAmount(elapsedS: number): number {
  if (!(elapsedS >= 0) || elapsedS >= CHROMA_S) return 0;
  const k = 1 - elapsedS / CHROMA_S;
  return CHROMA_PEAK * k * k;
}
