/**
 * The lights that show other visitors (#106): one small light drifting over the base per other
 * person connected. Pure: the position of light `i` is a function of `i` and the time only, so every
 * screen draws the same constellation (the server sends nothing but the count).
 */

/** At most this many lights, however many people are connected. */
export const MAX_PRESENCE_LIGHTS = 8;

/** Lights float between these heights (m): above the tallest module (about 2.4 m), under the labels' reach. */
export const LIGHT_HEIGHT = { min: 3.2, max: 5.4 } as const;
/** Orbit radius range (m) from the base's centre: inside the ring of modules (8.5 m) plus a margin. */
export const LIGHT_RADIUS = { min: 3, max: 11 } as const;

/** The golden angle: successive lights land well apart on the orbit. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Fraction in [0, 1) from an index and a salt: a fixed, evenly spread sequence. */
function frac(i: number, salt: number): number {
  const v = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export interface LightPosition {
  x: number;
  y: number;
  z: number;
}

/** How many lights for `presence` connected people (this player not counted). */
export function presenceLightCount(presence: number): number {
  return Math.min(MAX_PRESENCE_LIGHTS, Math.max(0, Math.floor(presence) - 1));
}

/**
 * Writes the position of light `i` at `t` seconds into `out`. Each light circles at its own radius
 * and a slow, own speed (a lap takes 60 to 120 s), bobs a little, and wanders in and out.
 */
export function presenceLightAt(i: number, t: number, out: LightPosition): LightPosition {
  const speed = (0.05 + 0.03 * frac(i, 1)) * (i % 2 === 0 ? 1 : -1);
  const angle = i * GOLDEN + t * speed;
  const base = LIGHT_RADIUS.min + (LIGHT_RADIUS.max - LIGHT_RADIUS.min) * 0.5;
  const swing = (LIGHT_RADIUS.max - LIGHT_RADIUS.min) * 0.5 * (0.35 + 0.65 * frac(i, 2));
  const r = base + swing * Math.sin(t * (0.07 + 0.05 * frac(i, 3)) + frac(i, 4) * Math.PI * 2);
  const midY = (LIGHT_HEIGHT.min + LIGHT_HEIGHT.max) / 2;
  const bob = (LIGHT_HEIGHT.max - LIGHT_HEIGHT.min) / 2;
  out.x = Math.cos(angle) * r;
  out.z = Math.sin(angle) * r;
  out.y = midY + bob * Math.sin(t * (0.3 + 0.2 * frac(i, 5)) + frac(i, 6) * Math.PI * 2);
  return out;
}

/** The positions of the lights for `count` of them at `t` (`count` clamped as in `presenceLightCount`). */
export function presenceLights(count: number, t: number): LightPosition[] {
  const n = Math.min(MAX_PRESENCE_LIGHTS, Math.max(0, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => presenceLightAt(i, t, { x: 0, y: 0, z: 0 }));
}

/** One frame of a light's size toward 1 (here) or 0 (gone): it grows and shrinks instead of popping. */
export function stepLightScale(scale: number, present: boolean, delta: number): number {
  const next = scale + ((present ? 1 : 0) - scale) * Math.min(1, delta * 2.5);
  return !present && next < 0.01 ? 0 : next;
}

/** A drone's slow blink: brightness between these, one cycle every few seconds. */
export const BLINK = { min: 0.6, max: 1, periodS: 2.6 } as const;

/** Brightness of drone `i` at `t` seconds: a slow sine in `BLINK`, each drone on its own phase. */
export function presenceBlink(i: number, t: number): number {
  const phase = frac(i, 7) * Math.PI * 2;
  const k = 0.5 + 0.5 * Math.sin((t / BLINK.periodS) * Math.PI * 2 + phase);
  return BLINK.min + (BLINK.max - BLINK.min) * k;
}
