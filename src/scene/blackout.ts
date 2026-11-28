/**
 * Blackout timing for the scene (plan 006 C.18). Pure. Track `scene` implements the TODO body and
 * keeps the emergency light mounted at all times (intensity 0 when off: adding or removing a light
 * recompiles every material's shader, a visible hitch on phones — neon round 2).
 */
import { MODULE_IDS, type ModuleId } from '../../shared/protocol';

/** After the generator is repaired, modules light up one by one this far apart (`MODULE_IDS` order). */
export const RELIGHT_STEP_MS = 150;

/** When module `id` lights up again, counted from the moment the blackout ended: generator at 0. */
export function relightDelayMs(id: ModuleId): number {
  return MODULE_IDS.indexOf(id) * RELIGHT_STEP_MS;
}

/** The blackout fade shared by the lights, the fog and the sky (plan 008 A.3). */
export const BLACKOUT_FADE = {
  /** Share of the daylight kept during a blackout. */
  level: 0.12,
  /** How fast the light follows the blackout (per second). The return is slower, so relighting is seen. */
  dimRate: 5,
  restoreRate: 2.5,
} as const;

/** One frame of the daylight level (1 = day, `BLACKOUT_FADE.level` = blackout), eased exponentially. */
export function stepDaylight(level: number, dark: boolean, delta: number): number {
  const target = dark ? BLACKOUT_FADE.level : 1;
  const rate = dark ? BLACKOUT_FADE.dimRate : BLACKOUT_FADE.restoreRate;
  return level + (target - level) * Math.min(1, delta * rate);
}

/** The daylight level as blackout progress: 0 in daylight, 1 at the depth of a blackout. */
export function darkness(level: number): number {
  return (1 - level) / (1 - BLACKOUT_FADE.level);
}

/** The current daylight level, stepped once per frame by `SceneTone` and read by `Lighting`. */
export const daylight = { level: 1 };
