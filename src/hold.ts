/**
 * Repair-button hold state machine (plan 003): idle -> holding -> pending -> idle.
 * Pure; `ui/Panel.tsx` and `net/socket.ts` feed it events, the store keeps the result, and
 * `send` is the repair request to put on the socket. Contract with task C in `docs/plans/003-tasks.md`.
 */
import type { RepairRequest } from '../shared/protocol';

/** Hold this long to send the repair. */
export const HOLD_MS = 1000;
/** A pending repair with no answer by then goes back to idle. */
export const PENDING_TIMEOUT_MS = 5000;
export type HoldState =
  | { kind: 'idle' }
  | { kind: 'holding'; faultId: string; startedAt: number }
  | { kind: 'pending'; faultId: string; sentAt: number };

/**
 * Plan 005: what to say after a repair is no longer kept here. `feedback.ts` classifies the
 * `repaired` message (mine / beaten / other) from the hold state *before* this reducer runs, and
 * shows it as a toast.
 */
export interface RepairUi {
  hold: HoldState;
}

export const initialRepairUi: RepairUi = { hold: { kind: 'idle' } };

/** All times are ms from the same clock (`performance.now()` or `Date.now()`). */
export type HoldEvent =
  /** Pointer down on an enabled button for the current fault. */
  | { type: 'press'; faultId: string; now: number }
  /** Pointer up. */
  | { type: 'release'; now: number }
  /** Pointer left the button area (checked on pointermove), pointercancel, blur, or tab hidden. */
  | { type: 'cancel'; now: number }
  /** The socket closed (status left `open`). */
  | { type: 'disconnect'; now: number }
  /** A `repaired` message arrived (after it was applied to the store). Ends a hold or a pending repair of that fault. */
  | { type: 'repaired'; faultId: string; now: number }
  /** A WS `snapshot` arrived (e.g. after a reconnect). */
  | { type: 'snapshot'; now: number }
  /** Animation-frame or timer tick: completes a hold, times out a pending repair. */
  | { type: 'tick'; now: number };

export interface HoldResult {
  ui: RepairUi;
  /** The request to send now, if this event completed a hold. */
  send: RepairRequest | null;
}

export function reduceHold(ui: RepairUi, event: HoldEvent): HoldResult {
  const { hold } = ui;
  const keep: HoldResult = { ui, send: null };
  switch (event.type) {
    case 'press':
      return hold.kind === 'idle'
        ? { ui: { ...ui, hold: { kind: 'holding', faultId: event.faultId, startedAt: event.now } }, send: null }
        : keep;
    case 'release':
    case 'cancel':
    case 'disconnect':
      return hold.kind === 'holding' ? { ui: { ...ui, hold: { kind: 'idle' } }, send: null } : keep;
    case 'repaired':
      // TODO(share, plan 005 D.11): holding or pending on `event.faultId` → idle; anything else unchanged.
      throw new Error('TODO(share): reduceHold repaired');
    case 'snapshot':
      return hold.kind === 'pending' ? { ui: { ...ui, hold: { kind: 'idle' } }, send: null } : keep;
    case 'tick': {
      if (hold.kind === 'holding' && event.now - hold.startedAt >= HOLD_MS) {
        return {
          ui: { ...ui, hold: { kind: 'pending', faultId: hold.faultId, sentAt: event.now } },
          send: { type: 'repair', faultId: hold.faultId },
        };
      }
      if (hold.kind === 'pending' && event.now - hold.sentAt >= PENDING_TIMEOUT_MS) {
        return { ui: { ...ui, hold: { kind: 'idle' } }, send: null };
      }
      return keep;
    }
  }
}

/** 0..1 fill for the button: elapsed/HOLD_MS while holding, 1 while pending, 0 when idle. */
export function holdProgress(hold: HoldState, now: number): number {
  if (hold.kind === 'idle') return 0;
  if (hold.kind === 'pending') return 1;
  return Math.min(1, Math.max(0, (now - hold.startedAt) / HOLD_MS));
}
