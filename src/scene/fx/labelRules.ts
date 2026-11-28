/**
 * Which label each module shows when several are broken (plan 006 C.15, C.17 + neon after round 3
 * (d)). Pure, unit tested. Track `scene` implements the TODO bodies.
 */
import { GENERATOR, MODULE_IDS, type Fault } from '../../../shared/protocol';
import { moduleName } from '../../modules';
import type { BaseModuleId } from '../../modules';

export interface LabelInput {
  /** Scene and base are in (`selectReady`). Before that no label at all (playtest #47). */
  ready: boolean;
  /** Oldest first, as in the store. */
  faults: readonly Fault[];
  selected: BaseModuleId | null;
  blackout: boolean;
  /** Modules whose fault someone *else* is holding right now (`holdingModules`). */
  holding: readonly BaseModuleId[];
  /** The first seconds after the base appears (`INTRO_MS`): every healthy module shows a faint name. */
  intro?: boolean;
}

export interface LabelPlan {
  /** The one big badge, or null when nothing is broken. */
  badge: BaseModuleId | null;
  /** Every other broken module: a small `⚠` dot. */
  dots: BaseModuleId[];
  /** A name tag: when nothing is broken (005 rule), or on the selected broken module (008 A.5). */
  tag: BaseModuleId | null;
  /** Modules that show a small grey name for a moment on arrival (nothing broken, not selected). */
  intro: BaseModuleId[];
}

/** How long (ms) the faint names stay on the first screen: long enough to read five, then they go. */
export const INTRO_MS = 6000;

/**
 * One big badge at most, so labels never pile up on a phone. Badge priority (first that applies):
 * 1. during a blackout, the generator (if broken) — the way out of the dark;
 * 2. a broken module someone else is repairing right now (several: `MODULE_IDS` order) — a dot
 *    being repaired by someone is promoted;
 * 3. the generator, if broken;
 * 4. the oldest fault.
 * `dots`: the other broken modules in `faults` order. Nothing broken: only the selected module has
 * a name tag, and the others stay bare; except for the first `INTRO_MS` after arrival, when `intro`
 * lists every module as a faint grey name, so the five names are told once (principle 3; #103).
 * Nothing at all until `ready`.
 *
 * A selected broken module gets only its name tag: its panel already says what is wrong and shows
 * the sensor (008 A.5). The others keep what they had with it selected: the generator in a
 * blackout or a module someone else is repairing keeps the badge, the rest are dots.
 */
export function labelPlan(input: LabelInput): LabelPlan {
  const { ready, faults, selected, blackout, holding, intro = false } = input;
  if (!ready) return { badge: null, dots: [], tag: null, intro: [] };
  if (faults.length === 0) {
    return { badge: null, dots: [], tag: selected, intro: intro ? MODULE_IDS.filter((id) => id !== selected) : [] };
  }

  const broken = faults.map((f) => f.moduleId);
  const isBroken = (id: BaseModuleId | null): id is BaseModuleId => id !== null && broken.includes(id);
  const held = holding.filter((id) => isBroken(id) && id !== selected);
  const heldPick = MODULE_IDS.find((id) => held.includes(id)) ?? null;

  if (isBroken(selected)) {
    const badge = blackout && selected !== GENERATOR && broken.includes(GENERATOR) ? GENERATOR : heldPick;
    return { badge, dots: broken.filter((id) => id !== badge && id !== selected), tag: selected, intro: [] };
  }

  let badge: BaseModuleId;
  if (blackout && broken.includes(GENERATOR)) badge = GENERATOR;
  else if (heldPick !== null) badge = heldPick;
  else if (broken.includes(GENERATOR)) badge = GENERATOR;
  else badge = broken[0] ?? GENERATOR;

  return { badge, dots: broken.filter((id) => id !== badge), tag: null, intro: [] };
}

/** Broken modules whose fault has `activity[fault.id] >= 1` (others holding), in `faults` order. */
export function holdingModules(faults: readonly Fault[], activity: Readonly<Record<string, number>>): BaseModuleId[] {
  return faults.filter((f) => (activity[f.id] ?? 0) >= 1).map((f) => f.moduleId);
}

/**
 * Big badge text: `⚠ 발전기 고장 · 눌러서 수리` (M2 call to action; the sensor reading is a small
 * second line), `⚠ 산소 탱크 고장 · 누군가 고치는 중` while someone else holds it (no separate
 * label), and just `⚠ 산소 탱크 고장` while its own panel is open (the panel button says how).
 */
export function badgeText(id: BaseModuleId, state: { othersHolding: boolean; panelOpen: boolean }): string {
  const head = `⚠ ${moduleName(id)} 고장`;
  if (state.othersHolding) return `${head} · 누군가 고치는 중`;
  return state.panelOpen ? head : `${head} · 눌러서 수리`;
}

/** A small dot names its module: `⚠ 거주 돔`. */
export function dotText(id: BaseModuleId): string {
  return `⚠ ${moduleName(id)}`;
}

/**
 * `Html` in its non-transform mode sizes this wrapper to the label's untransformed box (below and to
 * the right of the anchor point, since the centering `translate` is on the child), and ignores its
 * `pointerEvents` prop. Left at `auto` it was an invisible 155 x 49 px plate over the module's body,
 * and a tap on the body hit it instead of the tap box (#105). The tappable labels set `auto` themselves.
 */
export const LABEL_WRAPPER_STYLE = { pointerEvents: 'none' } as const;
