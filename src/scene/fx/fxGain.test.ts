import { Color, MeshBasicMaterial } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { PALETTE, luminance } from '../palette';
import { BLOOM_THRESHOLD, FX_GAIN, registerFx, setComposerGain } from './fxGain';

/**
 * The unlit (`toneMapped: false`) effects under the composer (008 B.4, R6). The composer tone maps
 * everything at the end, these included, so their colours are scaled up on that path: glows and
 * sparks over the Bloom threshold (they shine), rings and the selection under it (they do not).
 */
const linLum = ([r, g, b]: readonly [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

afterEach(() => setComposerGain(false));

describe('fx gain against the Bloom threshold', () => {
  it('the selection ring and the hull outline stay under it', () => {
    expect(luminance(PALETTE.select) * FX_GAIN.ring).toBeLessThan(BLOOM_THRESHOLD);
    // The hull is tone mapped like the scene and gets no gain.
    expect(luminance(PALETTE.select)).toBeLessThan(BLOOM_THRESHOLD);
  });

  it('no floor ring blooms (fault, repair sweep, ping, hold)', () => {
    for (const c of [PALETTE.fault, PALETTE.repaired, PALETTE.ping, PALETTE.hold]) {
      expect(luminance(c) * FX_GAIN.ring).toBeLessThan(BLOOM_THRESHOLD);
    }
  });

  it('the status light and the sparks go over it', () => {
    expect(luminance(PALETTE.statusLight) * FX_GAIN.glow).toBeGreaterThan(BLOOM_THRESHOLD);
    expect(luminance(PALETTE.spark) * FX_GAIN.glow).toBeGreaterThan(BLOOM_THRESHOLD);
  });

  it('the panel lamps stay under it: the field must not outshine the modules (A.4)', () => {
    expect(linLum(PALETTE.panelOn) * FX_GAIN.panel).toBeLessThan(BLOOM_THRESHOLD);
  });

  it('every gain makes up at least part of what the tone mapping takes', () => {
    for (const g of Object.values(FX_GAIN)) expect(g).toBeGreaterThanOrEqual(1);
  });
});

describe('registerFx', () => {
  it('scales the colour while the composer is on and puts it back after', () => {
    const m = new MeshBasicMaterial({ color: '#336699' });
    const base = m.color.clone();
    const stop = registerFx(m, 'glow');
    expect(m.color.equals(base)).toBe(true);
    setComposerGain(true);
    expect(m.color.r).toBeCloseTo(base.r * FX_GAIN.glow, 6);
    setComposerGain(false);
    expect(m.color.equals(base)).toBe(true);
    stop();
    setComposerGain(true);
    expect(m.color.equals(base)).toBe(true);
  });

  it('a material made while the composer is on gets the gain at once', () => {
    setComposerGain(true);
    const m = new MeshBasicMaterial({ color: new Color(0.2, 0.4, 0.1) });
    registerFx(m, 'ring');
    expect(m.color.g).toBeCloseTo(0.4 * FX_GAIN.ring, 6);
  });
});
