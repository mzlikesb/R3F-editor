/**
 * Every colour that means something, in one place (plan 008 A.1). Hex strings are sRGB; `panelOn`
 * / `panelOff` are linear RGB because they go straight into an instance colour buffer. Pure (no
 * three.js), so the tests can measure hue distance and contrast.
 */
export const PALETTE = {
  /** A broken module: emissive pulse, floor ring. */
  fault: '#ff2a1a',
  /** A repair: sweep ring, emissive blend. */
  repaired: '#3ddc84',
  /** A healthy module's status light. */
  statusLight: '#4ade80',
  /**
   * The selected module: its ring and outline. Violet, the widest gap in the hue circle: red is a
   * fault and the emergency light, green a repair, amber the hold ring, cyan the panel lights and ping.
   */
  select: '#c08cff',
  emergency: '#ff2a1a',
  hold: '#ffd166',
  ping: '#9fe3ff',
  spark: '#ffd27a',
  relight: '#ffe2a8',
  afterglow: '#5cf2a0',
  ground: '#5a4f47',
  /** Sky gradient, top to bottom of the screen (the CSS sky before plan 008). */
  sky: ['#070b18', '#14233f', '#2b3f5e'],
  /** Where the middle stop sits (0 top, 1 bottom). */
  skyMid: 0.48,
  /** Linear brightness of the sky (and so the fog) at the depth of a blackout. */
  skyBlackout: 0.14,
  /** Fog takes the bottom of the sky, so far ground melts into it. */
  fog: '#2b3f5e',
  /** Solar panels: quieter than the modules (A.4). */
  panel: { frame: '#79818c', face: '#1a2335', post: '#5a5f68' },
  panelOn: [0.25, 0.85, 1] as readonly [number, number, number],
  panelOff: [0.02, 0.03, 0.04] as readonly [number, number, number],
} as const;

type Rgb = readonly [number, number, number];

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Hex of a linear RGB colour. */
export function linearToHex(c: Rgb): string {
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255);
  return `#${c.map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`;
}

/** `hex` with its linear RGB multiplied by `k` (how `backgroundIntensity` and the fog dim it). */
export function scaleHex(hex: string, k: number): string {
  const [r, g, b] = rgb(hex).map(toLinear) as unknown as Rgb;
  return linearToHex([r * k, g * k, b * k]);
}

/** Relative luminance (WCAG), linear. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(toLinear) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Hue distance in degrees, the short way round (0..180). */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}
