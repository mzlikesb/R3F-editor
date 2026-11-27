/** Client store. It mirrors server state through the pure reducers; it never changes the base itself. */
import { create } from 'zustand';
import type { RepairRequest, ServerMessage, SnapshotMessage } from '../shared/protocol';
import { initialFeedback, type FeedbackEvent, type FeedbackState } from './feedback';
import { initialRepairUi, reduceHold, type HoldEvent, type RepairUi } from './hold';
import type { BaseModuleId } from './modules';
import { applyRestSnapshot, initialSync, type ConnectionStatus, type SyncState } from './sync';

export interface Store {
  sync: SyncState;
  connection: ConnectionStatus;
  selected: BaseModuleId | null;
  repair: RepairUi;
  feedback: FeedbackState;
  /**
   * Handles one WS message (plan 005, track `share`):
   * 1. applies it to `sync` (`applyServerMessage`);
   * 2. `repaired` that changed the base: classify with `classifyRepaired` from the hold state
   *    *before* step 3, then feed `{ type: 'repaired', outcome }` to the feedback reducer;
   *    a stale `repaired` (lower version, base unchanged) does nothing else;
   * 3. `repaired` → hold event `repaired`; `snapshot` → hold event `snapshot`;
   * 4. every message except `presence`: feedback event `base` with the new faulted state.
   * `net/socket.ts` calls this instead of the old `applyMessage`, and still sets the connection itself.
   */
  receive: (msg: ServerMessage, now: number) => void;
  applyRest: (snap: SnapshotMessage) => void;
  setConnection: (status: ConnectionStatus) => void;
  /** Selecting any module (non-null) also dismisses the hint for this session (`moduleTapped`). */
  select: (id: BaseModuleId | null) => void;
  /** Feeds the hold state machine; a completed hold goes out through the registered sender. */
  dispatchHold: (event: HoldEvent) => void;
  /** Feeds the feedback reducer (the toast's timer sends `tick`). */
  dispatchFeedback: (event: FeedbackEvent) => void;
}

let sender: ((req: RepairRequest) => void) | null = null;

/** `net/socket.ts` registers how to put a repair request on the wire. */
export function setRepairSender(fn: ((req: RepairRequest) => void) | null): void {
  sender = fn;
}

export const useStore = create<Store>((set, get) => ({
  sync: initialSync,
  connection: 'connecting',
  selected: null,
  repair: initialRepairUi,
  feedback: initialFeedback,
  receive: (msg, now) => {
    void msg;
    void now;
    throw new Error('TODO(share): store.receive');
  },
  applyRest: (snap) => set((s) => ({ sync: applyRestSnapshot(s.sync, snap) })),
  setConnection: (connection) => set({ connection }),
  select: (selected) => {
    // TODO(share, plan 005 B.8): a non-null selection also dispatches `moduleTapped`.
    // The repair button lives in the panel of the selected module. If selection moves away
    // mid-hold (e.g. a second finger taps the canvas), the button unmounts without a
    // pointerup, so cancel the hold here or it would complete on its own.
    if (selected !== get().selected) get().dispatchHold({ type: 'cancel', now: performance.now() });
    set({ selected });
  },
  dispatchHold: (event) => {
    const { ui, send } = reduceHold(get().repair, event);
    if (ui !== get().repair) set({ repair: ui });
    if (send) sender?.(send);
  },
  dispatchFeedback: (event) => {
    void event;
    throw new Error('TODO(share): store.dispatchFeedback');
  },
}));

// ---- selectors: tracks `feel` and `scene` read these; track `share` implements them ----

/** True while the server reports a fault (only the generator can break in this milestone). */
export function selectFaulted(s: Store): boolean {
  void s;
  throw new Error('TODO(share): selectFaulted');
}

/** `fault` when the current fault is on module `id`, else `ok` (also `ok` before the first snapshot). */
export function selectModuleStatus(s: Store, id: BaseModuleId): 'fault' | 'ok' {
  void s;
  void id;
  throw new Error('TODO(share): selectModuleStatus');
}
