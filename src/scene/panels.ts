import { GROUND_RADIUS } from './layout';
import { PROP_KEEP_OUT, baseKeepOut, gridScatter, type GridRule } from './scatter';

/**
 * The solar panel field and its lights (plan 007 A.2). Pure: placement, relight timing and the
 * colour buffer state machine. `SolarPanels.tsx` draws it.
 */

export const PANEL_SEED = 2007;

/**
 * North of the base (-z): behind it in the default overview, so the field fills the view above the
 * modules without covering them. Rows of wide panels; rocks added later avoid `PANELS`.
 */
export const PANEL_RULE: GridRule = {
  inner: 19,
  outer: GROUND_RADIUS - 2,
  arc: { center: Math.PI, half: (Math.PI * 70) / 180 },
  spacing: [3, 3],
  jitter: 0.12,
  radius: 1.25,
  gap: 0.2,
  avoid: [...baseKeepOut(), ...PROP_KEEP_OUT],
  yaw: { base: 0, jitter: 0.04 },
};

export const PANELS = gridScatter(PANEL_SEED, PANEL_RULE);

/** Lights come back over this long after the blackout ends, nearest the generator first. */
export const RELIGHT_MS = 1500;

/** Linear RGB of a panel light when powered and when dark. */
export const LIGHT_ON: readonly [number, number, number] = [0.25, 0.85, 1];
export const LIGHT_OFF: readonly [number, number, number] = [0.02, 0.03, 0.04];

/** Each point's relight delay: its distance from `origin`, mapped onto 0..`RELIGHT_MS`. */
export function relightDelays(
  points: readonly { x: number; z: number }[],
  origin: { x: number; z: number },
): Float32Array {
  const dist = points.map((p) => Math.hypot(p.x - origin.x, p.z - origin.z));
  const min = Math.min(...dist);
  const span = Math.max(...dist) - min;
  return Float32Array.from(dist, (d) => (span > 0 ? ((d - min) / span) * RELIGHT_MS : 0));
}

export interface PanelLights {
  phase: 'on' | 'off' | 'relight';
  /** When the current relight started (ms). */
  start: number;
  /** Relight time already handled (ms since `start`); panels with a delay up to this are lit. */
  done: number;
  readonly delays: Float32Array;
  /** RGB per panel: the `instanceColor` array, written in place. */
  readonly colors: Float32Array;
}

export function createPanelLights(delays: Float32Array): PanelLights {
  const colors = new Float32Array(delays.length * 3);
  fill(colors, LIGHT_ON);
  return { phase: 'on', start: 0, done: 0, delays, colors };
}

function fill(colors: Float32Array, rgb: readonly [number, number, number]) {
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = rgb[0];
    colors[i + 1] = rgb[1];
    colors[i + 2] = rgb[2];
  }
}

/**
 * One frame. A blackout darkens every light at once; its end lights each panel when its delay has
 * passed, for `RELIGHT_MS` only. Returns true when `colors` changed (the caller sets `needsUpdate`),
 * so outside a change or the relight window nothing is uploaded. No allocation.
 */
export function stepPanelLights(s: PanelLights, blackout: boolean, nowMs: number): boolean {
  if (blackout) {
    if (s.phase === 'off') return false;
    s.phase = 'off';
    fill(s.colors, LIGHT_OFF);
    return true;
  }
  if (s.phase === 'on') return false;
  if (s.phase === 'off') {
    s.phase = 'relight';
    s.start = nowMs;
    s.done = -1;
  }
  const elapsed = nowMs - s.start;
  let changed = false;
  const { delays, colors } = s;
  for (let i = 0; i < delays.length; i++) {
    const d = delays[i]!;
    if (d <= s.done || d > elapsed) continue;
    colors[i * 3] = LIGHT_ON[0];
    colors[i * 3 + 1] = LIGHT_ON[1];
    colors[i * 3 + 2] = LIGHT_ON[2];
    changed = true;
  }
  s.done = elapsed;
  if (elapsed >= RELIGHT_MS) s.phase = 'on';
  return changed;
}
