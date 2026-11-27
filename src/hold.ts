/**
 * Repair-button hold state machine (plans 003, 006 A.10, #15-4): idle -> holding -> pending -> idle.
 * Pure; `ui/Panel.tsx` and the store feed it events, the store keeps the result, and `send` is the
 * message to put on the socket. Track `client` implements the TODO body.
 */
import type { ClientMessage } from '../shared/protocol';

/** Hold this long to send the repair. */
export const HOLD_MS = 1000;
/** A pending repair with no answer by then goes back to idle. */
export const PENDING_TIMEOUT_MS = 5000;
export type HoldState =
  | { kind: 'idle' }
  | { kind: 'holding'; faultId: string; startedAt: number }
  | { kind: 'pending'; faultId: string; sentAt: number };

export interface RepairUi {
  hold: HoldState;
}

export const initialRepairUi: RepairUi = { hold: { kind: 'idle' } };

/** All times are ms from the same clock (`performance.now()`). */
export type HoldEvent =
  /** Pointer down on an enabled button for the fault `faultId`. */
  | { type: 'press'; faultId: string; now: number }
  /** Pointer up. */
  | { type: 'release'; now: number }
  /** Pointer left the button, pointercancel, blur, tab hidden, or the selection moved away. */
  | { type: 'cancel'; now: number }
  /** The socket closed (status left `open`). */
  | { type: 'disconnect'; now: number }
  /** A `repaired` arrived (after it was applied to the store). */
  | { type: 'repaired'; faultId: string; now: number }
  /** A WS `snapshot` arrived (e.g. after a reconnect). */
  | { type: 'snapshot'; now: number }
  /** After any versioned message: the faults that exist now. The button of a missing fault is gone. */
  | { type: 'faults'; ids: readonly string[]; now: number }
  /** Animation-frame tick: completes a hold, times out a pending repair. */
  | { type: 'tick'; now: number };

export interface HoldResult {
  ui: RepairUi;
  /** The message to send now, if any. */
  send: ClientMessage | null;
}

/**
 * - `press` (idle): holding, send `hold{faultId}`.
 * - `release` / `cancel` (holding): idle, send `release{faultId}`. `disconnect` (holding): idle, nothing to send.
 * - `tick` (holding, `HOLD_MS` passed): pending, send `repair{faultId}`. (pending, `PENDING_TIMEOUT_MS` passed): idle.
 * - `repaired` of the held or pending fault: idle, nothing (the server already cleared every hold on it).
 * - `snapshot` (pending): idle.
 * - `faults` without the held fault: idle, send `release`; without the pending fault: idle.
 * Everything else keeps `ui` itself (same reference) and sends nothing.
 */
export function reduceHold(ui: RepairUi, event: HoldEvent): HoldResult {
  void ui;
  void event;
  throw new Error('TODO(client): reduceHold');
}

/** 0..1 fill for the button: elapsed/HOLD_MS while holding, 1 while pending, 0 when idle. */
export function holdProgress(hold: HoldState, now: number): number {
  if (hold.kind === 'idle') return 0;
  if (hold.kind === 'pending') return 1;
  return Math.min(1, Math.max(0, (now - hold.startedAt) / HOLD_MS));
}
