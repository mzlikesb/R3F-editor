/**
 * Blackout timing for the scene (plan 006 C.18). Pure. Track `scene` implements the TODO body and
 * keeps the emergency light mounted at all times (intensity 0 when off: adding or removing a light
 * recompiles every material's shader, a visible hitch on phones — neon round 2).
 */
import type { ModuleId } from '../../shared/protocol';

/** After the generator is repaired, modules light up one by one this far apart (`MODULE_IDS` order). */
export const RELIGHT_STEP_MS = 150;

/** When module `id` lights up again, counted from the moment the blackout ended: generator at 0. */
export function relightDelayMs(id: ModuleId): number {
  void id;
  throw new Error('TODO(scene): relightDelayMs');
}
