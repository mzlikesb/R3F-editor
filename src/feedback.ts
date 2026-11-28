/**
 * What the player is told and shown around a repair or a new fault (plans 005, 006). Pure; the
 * store feeds it and keeps the result. Track `client` implements the TODO bodies; track `scene`
 * only reads `FeedbackState.effect` and `effectsFor`.
 */
import type { ModuleId } from '../shared/protocol';
import { moduleName, withObjectParticle, withSubjectParticle } from './modules';
import type { HoldState } from './hold';
import { initialCombo, nextCombo, type Combo } from './combo';

/** Toasts show this long (ms). */
export const TOAST_MS = 3000;

/**
 * Who a `repaired` was for, from this client's view.
 * - `mine`: `mine: true` (my request counted)
 * - `helped`: `helped: true` (I was holding it when someone else's request counted, #56)
 * - `beaten`: neither, while I was holding or pending on that fault
 * - `other`: `mine: false` otherwise
 */
export type RepairOutcome = 'mine' | 'helped' | 'beaten' | 'other';

/** `fault`: a module broke while this tab was open (every `fault` message is live; arrival faults come in the snapshot). */
export type ToastKind = RepairOutcome | 'fault';

export interface Toast {
  kind: ToastKind;
  moduleId: ModuleId;
  /** Hidden from this time (ms, `performance.now()`). */
  until: number;
  /** The combo this repair made (`nextCombo`), shown as `x2` and up; 0 on toasts that are not my repair. */
  combo: number;
}

/** Which repair effects to play on the repaired module. */
export interface RepairEffects {
  sweep: boolean;
  burst: boolean;
  /** The burst is the light one of a helper: no glow flash, a smaller punch, half the sparks. */
  soft: boolean;
  ringPing: boolean;
  /** A soft green glow on the module for `AFTERGLOW_MS`: someone else was just here. */
  afterglow: boolean;
}

/** How long the afterglow of someone else's repair lasts (playtest #47, principle 1). */
export const AFTERGLOW_MS = 3000;

/** The latest repair to animate. `seq` goes up by one per repair, so the scene can react exactly once. */
export interface RepairEffect {
  outcome: RepairOutcome;
  /** The module to play it on. */
  moduleId: ModuleId;
  seq: number;
  /** `performance.now()` when the `repaired` arrived. */
  at: number;
}

export interface FeedbackState {
  /** At most one toast; a new one replaces the current one (latest wins). */
  toast: Toast | null;
  /** Set once any module was tapped this session; the hint never shows again. */
  hintDismissed: boolean;
  /** The latest repair seen over WS in this session (snapshots never set it). */
  effect: RepairEffect | null;
  /** My repair run (plan 008 C.2). Snapshots never touch it, so it outlives a reconnect. */
  combo: Combo;
}

export const initialFeedback: FeedbackState = { toast: null, hintDismissed: false, effect: null, combo: initialCombo };

export type FeedbackEvent =
  /** A `repaired` that changed the base (not a stale version), already classified. */
  | { type: 'repaired'; outcome: RepairOutcome; moduleId: ModuleId; now: number }
  /** A `fault` that changed the base. */
  | { type: 'fault'; moduleId: ModuleId; now: number }
  /** Any module (or a badge) was tapped. */
  | { type: 'moduleTapped' }
  /** Timer tick; hides an expired toast. */
  | { type: 'tick'; now: number };

/**
 * - mine: `내가 고쳤어요 +1`
 * - helped: `함께 고쳤어요 +1`
 * - beaten: `같이 눌렀는데 다른 사람이 한발 먼저 고쳤어요`
 * - other: `누군가 산소 탱크를 고쳤어요` (module name + 을/를)
 * - fault: `온실이 고장 났어요` (module name + 이/가)
 */
export function toastText(toast: Pick<Toast, 'kind' | 'moduleId'>): string {
  const name = moduleName(toast.moduleId);
  switch (toast.kind) {
    case 'mine':
      return '내가 고쳤어요 +1';
    case 'helped':
      return '함께 고쳤어요 +1';
    case 'beaten':
      return '같이 눌렀는데 다른 사람이 한발 먼저 고쳤어요';
    case 'other':
      return `누군가 ${withObjectParticle(name)} 고쳤어요`;
    case 'fault':
      return `${withSubjectParticle(name)} 고장 났어요`;
  }
}

/** The small second part of a toast: my repair took a part from the store (plan 009 B.6). */
export function toastNote(kind: ToastKind): string | null {
  return kind === 'mine' ? '부품 1개 사용' : null;
}

/** Classifies a `repaired` from the hold state *before* `reduceHold` handles it. */
export function classifyRepaired(
  hold: HoldState,
  msg: { faultId: string; mine: boolean; helped: boolean },
): RepairOutcome {
  if (msg.mine) return 'mine';
  // The server saw my hold when it counted; trust it over this tab's own state.
  if (msg.helped) return 'helped';
  const busyOnIt = (hold.kind === 'holding' || hold.kind === 'pending') && hold.faultId === msg.faultId;
  return busyOnIt ? 'beaten' : 'other';
}

export function effectsFor(outcome: RepairOutcome): RepairEffects {
  const mine = outcome === 'mine';
  const helped = outcome === 'helped';
  const own = mine || helped;
  return { sweep: true, burst: own, soft: helped, ringPing: !own, afterglow: !own };
}

/**
 * - `repaired`: toast for the outcome and module (replacing any toast), `effect` with the next `seq`,
 *   `combo` from `nextCombo` (the toast carries its count only when this repair moved it).
 * - `fault`: toast `fault` for that module.
 * - `moduleTapped`: `hintDismissed` = true.
 * - `tick`: drop the toast once `now >= until`.
 * Returns `state` itself when nothing changes.
 */
export function reduceFeedback(state: FeedbackState, event: FeedbackEvent): FeedbackState {
  switch (event.type) {
    case 'repaired': {
      const combo = nextCombo(state.combo, event);
      return {
        ...state,
        combo,
        toast: {
          kind: event.outcome,
          moduleId: event.moduleId,
          until: event.now + TOAST_MS,
          combo: combo === state.combo ? 0 : combo.count,
        },
        effect: {
          outcome: event.outcome,
          moduleId: event.moduleId,
          seq: (state.effect?.seq ?? 0) + 1,
          at: event.now,
        },
      };
    }
    case 'fault':
      return { ...state, toast: { kind: 'fault', moduleId: event.moduleId, until: event.now + TOAST_MS, combo: 0 } };
    case 'moduleTapped':
      return state.hintDismissed ? state : { ...state, hintDismissed: true };
    case 'tick':
      return state.toast && event.now >= state.toast.until ? { ...state, toast: null } : state;
  }
}

/**
 * The bottom hint `고장 난 모듈을 눌러 보세요`: only once the base has loaded, while anything is
 * faulted, until a module is tapped.
 */
export function hintVisible(faulted: boolean, state: FeedbackState, loaded: boolean): boolean {
  return loaded && faulted && !state.hintDismissed;
}

export type BottomItem = 'panel' | 'toast' | 'hint';

/** Bottom-of-screen order, closest to the edge first: panel > toast > hint. Only the visible ones. */
export function bottomStack(visible: { panel: boolean; toast: boolean; hint: boolean }): BottomItem[] {
  const order: BottomItem[] = ['panel', 'toast', 'hint'];
  return order.filter((item) => visible[item]);
}
