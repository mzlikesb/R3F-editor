/**
 * What the player is told and shown around a repair (plan 005 B.8, C.10, D.11-13). Pure; the store
 * feeds it and keeps the result. Track `share` implements it; track `feel` only reads
 * `FeedbackState.effect` and `effectsFor`. Contract in `docs/plans/005-tasks.md`.
 */
import type { HoldState } from './hold';

/** Toasts show this long (ms). */
export const TOAST_MS = 3000;

/**
 * A fault counts as a "re-fault" (toast `발전기가 다시 고장 났어요`) only when this client saw the
 * base healthy over WS for at least this long first. The first-visit fault arrives a few ms after
 * the first snapshot and must not toast (plan 005 D.13: no toast for a fault already there on arrival).
 */
export const REFAULT_TOAST_MIN_HEALTHY_MS = 2000;

/**
 * Who a `repaired` was for, from this client's view.
 * - `mine`: `mine: true` (my request counted)
 * - `beaten`: `mine: false` while I was holding or pending on that fault
 * - `other`: `mine: false` otherwise
 */
export type RepairOutcome = 'mine' | 'beaten' | 'other';

export type ToastKind = RepairOutcome | 'refault';

export const TOAST_TEXT: Record<ToastKind, string> = {
  mine: '내가 고쳤어요 +1',
  beaten: '누군가 먼저 고쳤어요',
  other: '누군가 발전기를 고쳤어요',
  refault: '발전기가 다시 고장 났어요',
};

export interface Toast {
  kind: ToastKind;
  /** Hidden from this time (ms). */
  until: number;
}

/** Which repair effects to play (plan 005 C.9, C.10, D.11). */
export interface RepairEffects {
  /** Red→green emissive blend and the ring that sweeps up the module. Every repair. */
  sweep: boolean;
  /** White flash, scale punch, sparks, glow sprite. Only my repair. */
  burst: boolean;
  /** Ring rippling flat across the ground. Only someone else's repair (`beaten` or `other`). */
  ringPing: boolean;
}

/** The latest repair to animate. `seq` goes up by one per repair, so the scene can react exactly once. */
export interface RepairEffect {
  outcome: RepairOutcome;
  seq: number;
  /** `performance.now()` when the `repaired` arrived. */
  at: number;
}

export interface FeedbackState {
  /** At most one toast; a new one replaces the current one (latest wins). */
  toast: Toast | null;
  /** When this client last saw the base become healthy over WS; null while faulted or before any WS state. */
  healthySince: number | null;
  /** Set once any module was tapped this session; the hint never shows again. */
  hintDismissed: boolean;
  effect: RepairEffect | null;
}

export const initialFeedback: FeedbackState = { toast: null, healthySince: null, hintDismissed: false, effect: null };

export type FeedbackEvent =
  /** A `repaired` that changed the base (not a stale version), already classified. */
  | { type: 'repaired'; outcome: RepairOutcome; now: number }
  /** After every WS message was applied: is the base faulted now? */
  | { type: 'base'; faulted: boolean; now: number }
  /** Any module (or the fault badge) was tapped. */
  | { type: 'moduleTapped' }
  /** Timer tick; hides an expired toast. */
  | { type: 'tick'; now: number };

/** Classifies a `repaired` from the hold state *before* `reduceHold` handles it. */
export function classifyRepaired(hold: HoldState, msg: { faultId: string; mine: boolean }): RepairOutcome {
  void hold;
  void msg;
  throw new Error('TODO(share): classifyRepaired');
}

export function effectsFor(outcome: RepairOutcome): RepairEffects {
  void outcome;
  throw new Error('TODO(share): effectsFor');
}

/**
 * - `repaired`: toast for the outcome (replacing any toast), `effect` with the next `seq`.
 * - `base` faulted=false: start `healthySince` if not set. faulted=true: if `healthySince` is set and
 *   at least `REFAULT_TOAST_MIN_HEALTHY_MS` old, toast `refault`; then clear `healthySince`.
 * - `moduleTapped`: `hintDismissed` = true.
 * - `tick`: drop the toast once `now >= until`.
 * Returns `state` itself when nothing changes.
 */
export function reduceFeedback(state: FeedbackState, event: FeedbackEvent): FeedbackState {
  void state;
  void event;
  throw new Error('TODO(share): reduceFeedback');
}

/** The bottom hint `고장 난 모듈을 눌러 보세요`: only while faulted, until a module is tapped. */
export function hintVisible(faulted: boolean, state: FeedbackState): boolean {
  void faulted;
  void state;
  throw new Error('TODO(share): hintVisible');
}

export type BottomItem = 'panel' | 'toast' | 'hint';

/**
 * Bottom-of-screen order, closest to the edge first (plan 005 D.12): panel > toast > hint. Only the
 * visible ones, so a toast takes the panel's slot when there is no panel, and sits above it otherwise.
 */
export function bottomStack(visible: { panel: boolean; toast: boolean; hint: boolean }): BottomItem[] {
  void visible;
  throw new Error('TODO(share): bottomStack');
}
