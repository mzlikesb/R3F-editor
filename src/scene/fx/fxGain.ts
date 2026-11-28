import { Color } from 'three';

/**
 * Colours of the unlit effects (`toneMapped: false`) on the composer path (plan 008 B.4, R6).
 *
 * Without the composer the renderer skips tone mapping for these, so they show their plain colour.
 * The composer tone maps the whole frame once at the end (ACES), these included, which pales them
 * (a green status light came out white-mint, a red ring orange). Scaling them up only made that
 * worse. So while the composer is on they get a colour chosen to come out of ACES as their plain
 * colour (`untoneMap`), as close as ACES allows: rings, status lights and the visitors' lights look
 * the same on both paths. Sparks go past the Bloom threshold on top of that (they are what
 * flashes). Additive sprites with a coloured texture under a white material colour can only take a
 * plain scale. The plain path (fallback, last quality step) keeps the old colours.
 */

/** Bloom's luminance threshold (linear, before tone mapping), from #99's `look=max`. */
export const BLOOM_THRESHOLD = 1.2;

/** Sparks on top of their tone-matched colour: bright enough to bloom. */
export const FLASH_GAIN = 2;

/** Plain scales, for materials whose colour is white over a texture or instance colours. */
export const FX_SCALE = {
  /** The status light's soft green halo sprite: a little, so the halo stays green. */
  halo: 1.2,
  /** The repair glow sprite (a white flare): blooms. */
  burst: 2.5,
  /** Solar panel lamps (instance colours times this): under the threshold (A.4). */
  panel: 1.4,
} as const;

/**
 * `tone`: comes out of ACES as its plain colour (rings, status light, visitors' lights).
 * `flash`: the same, times `FLASH_GAIN` (sparks). The rest scale by `FX_SCALE`.
 */
export type FxKind = 'tone' | 'flash' | keyof typeof FX_SCALE;

export type Rgb = [number, number, number];

/** three's `ACESFilmicToneMapping` at exposure 1 (the composer's `ToneMapping` effect), linear in and out. */
export function acesFilmic([r, g, b]: Readonly<Rgb>): Rgb {
  const s = 1 / 0.6;
  const x = [
    (0.59719 * r + 0.35458 * g + 0.04823 * b) * s,
    (0.076 * r + 0.90834 * g + 0.01566 * b) * s,
    (0.0284 * r + 0.13383 * g + 0.83777 * b) * s,
  ].map((v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081));
  const [a = 0, c = 0, d = 0] = x;
  const out: Rgb = [
    1.60475 * a - 0.53108 * c - 0.07367 * d,
    -0.10208 * a + 1.10813 * c - 0.00605 * d,
    -0.00327 * a - 0.07276 * c + 1.07602 * d,
  ];
  return out.map((v) => Math.min(1, Math.max(0, v))) as Rgb;
}

/** Highest output channel asked for: ACES never quite reaches 1. */
const MAX_TARGET = 0.97;

/**
 * The linear colour that ACES turns into `target` (each channel capped at `MAX_TARGET`), or the
 * nearest it can: ACES cannot make a fully saturated green, so that one comes out a little paler.
 * Iterative; run when a colour is registered, never per frame.
 */
export function untoneMap(target: Readonly<Rgb>): Rgb {
  const t = target.map((v) => Math.min(v, MAX_TARGET)) as Rgb;
  const x: Rgb = [t[0], t[1], t[2]];
  for (let i = 0; i < 400; i++) {
    const y = acesFilmic(x);
    for (let k = 0; k < 3; k++) x[k] = Math.max(0, x[k]! + (t[k]! - y[k]!) * 1.5);
  }
  return x;
}

/** The colour `base` takes under the composer. */
export function composerColor(base: Color, kind: FxKind): Color {
  if (kind === 'tone' || kind === 'flash') {
    const [r, g, b] = untoneMap([base.r, base.g, base.b]);
    const c = new Color(r, g, b);
    return kind === 'flash' ? c.multiplyScalar(FLASH_GAIN) : c;
  }
  return base.clone().multiplyScalar(FX_SCALE[kind]);
}

let composer = false;
const listeners = new Set<() => void>();

/**
 * A colour with its plain and composer versions worked out once. `get()` returns the current one
 * without allocating, for code that copies a colour every frame (`PresenceLights`).
 */
export interface FxColor {
  readonly plain: Color;
  get: () => Color;
}

export function fxColor(base: Color, kind: FxKind): FxColor {
  const plain = base.clone();
  const tuned = composerColor(base, kind);
  return { plain, get: () => (composer ? tuned : plain) };
}

/**
 * Puts `material.color` under the composer colour while the composer is on. The colour it has now
 * is its plain colour. Returns the function that takes it out again (back to the plain colour).
 */
export function registerFx(material: { color: Color }, kind: FxKind): () => void {
  const c = fxColor(material.color, kind);
  const apply = () => material.color.copy(c.get());
  listeners.add(apply);
  apply();
  return () => {
    listeners.delete(apply);
    material.color.copy(c.plain);
  };
}

/** `post/PostStack.tsx` turns this on while the composer is mounted. */
export function setComposerGain(on: boolean): void {
  if (on === composer) return;
  composer = on;
  for (const apply of listeners) apply();
}
