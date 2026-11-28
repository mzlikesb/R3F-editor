import { Color, MeshBasicMaterial } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { PALETTE } from '../palette';
import {
  BLOOM_THRESHOLD,
  FX_SCALE,
  acesFilmic,
  composerColor,
  fxColor,
  registerFx,
  setComposerGain,
  untoneMap,
  type FxKind,
  type Rgb,
} from './fxGain';

/**
 * The unlit (`toneMapped: false`) effects under the composer (008 B.4, R6). The composer tone maps
 * everything at the end, these included; their composer colours are chosen to come out of ACES as
 * the plain colour (rings, status lights, visitors' lights), and only what should flash goes over
 * the Bloom threshold.
 */
const lin = (c: Color): Rgb => [c.r, c.g, c.b];
const lum = ([r, g, b]: Readonly<Rgb>) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** What the screen shows for an unlit colour under the composer (before Bloom adds to it). */
const shown = (hex: string, kind: FxKind) => acesFilmic(lin(composerColor(new Color(hex), kind)));

afterEach(() => setComposerGain(false));

describe('tone-matched colours (rings, status light, visitors)', () => {
  it('ACES of the tuned red ring, amber hold and lilac ping is their plain colour', () => {
    for (const hex of [PALETTE.fault, PALETTE.hold, PALETTE.ping]) {
      const want = lin(new Color(hex)).map((v) => Math.min(v, 0.97));
      const got = shown(hex, 'tone');
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!)).toBeLessThan(0.05);
    }
  });

  it('the cyan selection stays blue-cyan (ACES cannot keep its low red exactly)', () => {
    const [r, g, b] = shown(PALETTE.select, 'tone');
    expect(b).toBeGreaterThan(0.9);
    expect(b - r).toBeGreaterThan(0.5);
    expect(g).toBeGreaterThan(r);
  });

  it('the status light stays green, not white-mint as with the old plain x2.5', () => {
    const [r, g, b] = shown(PALETTE.statusLight, 'tone');
    expect(g - Math.max(r, b)).toBeGreaterThan(0.4);
    const [r0, g0, b0] = acesFilmic(lin(new Color(PALETTE.statusLight).multiplyScalar(2.5)));
    expect(g0 - Math.max(r0, b0)).toBeLessThan(0.4);
  });

  it('the visitors’ lights stay yellow-green', () => {
    const [r, g, b] = shown(PALETTE.presenceLight, 'tone');
    expect(g).toBeGreaterThan(r);
    expect(g - b).toBeGreaterThan(0.4);
  });

  it('untoneMap hits a colour inside what ACES can make', () => {
    const t: Rgb = [0.4, 0.3, 0.25];
    const got = acesFilmic(untoneMap(t));
    for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - t[k]!)).toBeLessThan(0.01);
  });
});

describe('against the Bloom threshold', () => {
  it('no floor ring blooms, the selection included', () => {
    for (const c of [PALETTE.fault, PALETTE.repaired, PALETTE.hold, PALETTE.select]) {
      expect(lum(lin(composerColor(new Color(c), 'tone')))).toBeLessThan(BLOOM_THRESHOLD);
    }
  });

  it('the big ping (additive, opacity 1) plus the lit ground under it still does not bloom', () => {
    // The ground's linear luminance in full sun stays under 0.3 (#5a4f47 under the key light).
    const groundLit = 0.3;
    expect(lum(lin(composerColor(new Color(PALETTE.ping), 'tone'))) + groundLit).toBeLessThan(BLOOM_THRESHOLD);
  });

  it('the status light does not bloom (its own halo sprite is the glow)', () => {
    expect(lum(lin(composerColor(new Color(PALETTE.statusLight), 'tone')))).toBeLessThan(BLOOM_THRESHOLD);
  });

  it('sparks go over it and stay warm', () => {
    expect(lum(lin(composerColor(new Color(PALETTE.spark), 'flash')))).toBeGreaterThan(BLOOM_THRESHOLD);
    const [r, , b] = shown(PALETTE.spark, 'flash');
    expect(r - b).toBeGreaterThan(0.25);
  });

  it('the panel lamps stay under it: the field must not outshine the modules (A.4)', () => {
    expect(lum(PALETTE.panelOn as Rgb) * FX_SCALE.panel).toBeLessThan(BLOOM_THRESHOLD);
  });
});

describe('registerFx and fxColor', () => {
  it('switches the colour while the composer is on and puts it back after', () => {
    const m = new MeshBasicMaterial({ color: '#336699' });
    const base = m.color.clone();
    const stop = registerFx(m, 'burst');
    expect(m.color.equals(base)).toBe(true);
    setComposerGain(true);
    expect(m.color.r).toBeCloseTo(base.r * FX_SCALE.burst, 6);
    setComposerGain(false);
    expect(m.color.equals(base)).toBe(true);
    setComposerGain(true);
    stop();
    expect(m.color.equals(base)).toBe(true);
  });

  it('a material made while the composer is on gets its composer colour at once', () => {
    setComposerGain(true);
    const m = new MeshBasicMaterial({ color: new Color(PALETTE.fault) });
    registerFx(m, 'tone');
    expect(m.color.equals(composerColor(new Color(PALETTE.fault), 'tone'))).toBe(true);
  });

  it('fxColor.get returns the same object every frame (no allocation)', () => {
    const c = fxColor(new Color('#9af25c'), 'tone');
    expect(c.get()).toBe(c.get());
    setComposerGain(true);
    expect(c.get()).toBe(c.get());
    expect(c.get()).not.toBe(c.plain);
  });
});
