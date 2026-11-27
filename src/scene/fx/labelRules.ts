/**
 * Which label each module shows when several are broken (plan 006 C.15, C.17 + neon after round 3
 * (d)). Pure, unit tested. Track `scene` implements the TODO bodies.
 */
import { GENERATOR, MODULE_IDS, type Fault } from '../../../shared/protocol';
import { moduleName } from '../../modules';
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
  const { faults, selected, blackout, holding } = input;
  if (faults.length === 0) return { badge: null, dots: [], tag: selected ?? GENERATOR };

  const broken = faults.map((f) => f.moduleId);
  const isBroken = (id: BaseModuleId | null): id is BaseModuleId => id !== null && broken.includes(id);
  const held = holding.filter(isBroken);
  const heldPick =
    held.length === 0
      ? null
      : selected !== null && held.includes(selected)
        ? selected
        : (MODULE_IDS.find((id) => held.includes(id)) ?? null);

  let badge: BaseModuleId;
  if (blackout && broken.includes(GENERATOR)) badge = GENERATOR;
  else if (heldPick !== null) badge = heldPick;
  else if (isBroken(selected)) badge = selected;
  else if (broken.includes(GENERATOR)) badge = GENERATOR;
  else badge = broken[0] ?? GENERATOR;

  return { badge, dots: broken.filter((id) => id !== badge), tag: null };
}

/** Broken modules whose fault has `activity[fault.id] >= 1` (others holding), in `faults` order. */
export function holdingModules(faults: readonly Fault[], activity: Readonly<Record<string, number>>): BaseModuleId[] {
  return faults.filter((f) => (activity[f.id] ?? 0) >= 1).map((f) => f.moduleId);
}

/**
 * Big badge text: `⚠ 산소 탱크 고장 · 누군가 고치는 중` while someone else holds it (no separate
 * label), else `⚠ 산소 탱크 고장 · 92%` (`sensorText` = `formatSensor(...)`).
 */
export function badgeText(id: BaseModuleId, state: { othersHolding: boolean; sensorText: string }): string {
  const status = state.othersHolding ? '누군가 고치는 중' : state.sensorText;
  return `⚠ ${moduleName(id)} 고장 · ${status}`;
}
