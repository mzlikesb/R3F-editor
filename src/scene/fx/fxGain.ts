import type { Color } from 'three';

/**
 * Brightness of the unlit effects (`toneMapped: false`) on the composer path (plan 008 B.4, R6).
 *
 * Without the composer the renderer skips tone mapping for these, so they show their plain colour.
 * The composer tone maps the whole frame once at the end (ACES), these included, which dims their
 * highlights. So while it is on, their colours are scaled: glows and sparks past the Bloom threshold
 * (they are what shines), rings and the selection only enough to make up for the tone mapping, under
 * the threshold. The panel lamps stay under it too, so the field does not outshine the modules (A.4).
 * The plain path (fallback, last quality step) keeps the old colours; a difference there is allowed.
 */

/** Bloom's luminance threshold (linear, before tone mapping), from #99's `look=max`. */
export const BLOOM_THRESHOLD = 1.2;

export const FX_GAIN = {
  /** Status light, its glow, the repair glow, sparks. */
  glow: 2.5,
  /** Floor rings: fault, sweep, ping, hold, selection. */
  ring: 1.3,
  /** Solar panel lamps (instance colours times this). */
  panel: 1.4,
} as const;

export type FxKind = keyof typeof FX_GAIN;

interface Entry {
  color: Color;
  base: Color;
  kind: FxKind;
}

const entries = new Set<Entry>();
let composer = false;

function apply(e: Entry) {
  e.color.copy(e.base);
  if (composer) e.color.multiplyScalar(FX_GAIN[e.kind]);
}

/**
 * Puts `material.color` under the gain. The colour it has now is its plain colour. Returns the
 * function that takes it out again (and leaves the plain colour). Not per frame.
 */
export function registerFx(material: { color: Color }, kind: FxKind): () => void {
  const e: Entry = { color: material.color, base: material.color.clone(), kind };
  entries.add(e);
  apply(e);
  return () => {
    entries.delete(e);
    e.color.copy(e.base);
  };
}

/** `post/PostStack.tsx` turns this on while the composer is mounted. */
export function setComposerGain(on: boolean): void {
  if (on === composer) return;
  composer = on;
  for (const e of entries) apply(e);
}
