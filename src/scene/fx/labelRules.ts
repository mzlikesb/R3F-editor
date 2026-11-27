/**
 * Which label each module shows when several are broken (plan 006 C.15, C.17 + neon after round 3
 * (d)). Pure, unit tested. Track `scene` implements the TODO bodies.
 */
import type { Fault } from '../../../shared/protocol';
import type { BaseModuleId } from '../../modules';

export interface LabelInput {
  /** Oldest first, as in the store. */
  faults: readonly Fault[];
  selected: BaseModuleId | null;
  blackout: boolean;
  /** Modules whose fault someone *else* is holding right now (`holdingModules`). */
  holding: readonly BaseModuleId[];
}

export interface LabelPlan {
  /** The one big badge, or null when nothing is broken. */
  badge: BaseModuleId | null;
  /** Every other broken module: a small `⚠` dot. */
  dots: BaseModuleId[];
  /** A name tag (005 rule), only when nothing is broken. */
  tag: BaseModuleId | null;
}

/**
 * One big badge at most, so labels never pile up on a phone. Badge priority (first that applies):
 * 1. during a blackout, the generator (if broken) — the way out of the dark;
 * 2. a broken module someone else is repairing right now (several: the selected one, else
 *    `MODULE_IDS` order) — a dot being repaired by someone is promoted;
 * 3. the selected module, if broken;
 * 4. the generator, if broken;
 * 5. the oldest fault.
 * `dots`: the other broken modules in `faults` order. `tag` (nothing broken): the selected module,
 * or the generator in the overview (005).
 */
export function labelPlan(input: LabelInput): LabelPlan {
  void input;
  throw new Error('TODO(scene): labelPlan');
}

/** Broken modules whose fault has `activity[fault.id] >= 1` (others holding), in `faults` order. */
export function holdingModules(faults: readonly Fault[], activity: Readonly<Record<string, number>>): BaseModuleId[] {
  void faults;
  void activity;
  throw new Error('TODO(scene): holdingModules');
}

/**
 * Big badge text: `⚠ 산소 탱크 고장 · 누군가 고치는 중` while someone else holds it (no separate
 * label), else `⚠ 산소 탱크 고장 · 92%` (`sensorText` = `formatSensor(...)`).
 */
export function badgeText(id: BaseModuleId, state: { othersHolding: boolean; sensorText: string }): string {
  void id;
  void state;
  throw new Error('TODO(scene): badgeText');
}
