/** Client store. It mirrors server state through the pure reducers; it never changes the base itself. */
import { create } from 'zustand';
import type { RepairRequest, ServerMessage, SnapshotMessage } from '../shared/protocol';
import { classifyRepaired, initialFeedback, reduceFeedback, type FeedbackEvent, type FeedbackState } from './feedback';
import { initialRepairUi, reduceHold, type HoldEvent, type RepairUi } from './hold';
import type { BaseModuleId } from './modules';
import { applyRestSnapshot, applyServerMessage, initialSync, type ConnectionStatus, type SyncState } from './sync';

export interface Store {
  sync: SyncState;
  connection: ConnectionStatus;
  selected: BaseModuleId | null;
  repair: RepairUi;
  feedback: FeedbackState;
  /** The scene finished its first load (models and HDRI, or their fallbacks). Latches. */
  loaded: boolean;
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
  /** `ui/Loading.tsx` calls this once the loading overlay goes away. */
  setLoaded: () => void;
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
  loaded: false,
  receive: (msg, now) => {
    const before = get();
    const sync = applyServerMessage(before.sync, msg);
    let feedback = before.feedback;
    let repair = before.repair;
    if (msg.type === 'repaired') {
      // A stale repaired (base unchanged) does nothing at all.
      if (sync.base !== before.sync.base) {
        const outcome = classifyRepaired(before.repair.hold, msg);
        feedback = reduceFeedback(feedback, { type: 'repaired', outcome, now });
        repair = reduceHold(repair, { type: 'repaired', faultId: msg.faultId, now }).ui;
      }
    } else if (msg.type === 'snapshot') {
      repair = reduceHold(repair, { type: 'snapshot', now }).ui;
    }
    if (msg.type !== 'presence') {
      feedback = reduceFeedback(feedback, { type: 'base', faulted: sync.base?.fault != null, now });
    }
    set({ sync, feedback, repair });
  },
  applyRest: (snap) => set((s) => ({ sync: applyRestSnapshot(s.sync, snap) })),
  setConnection: (connection) => set({ connection }),
  setLoaded: () => {
    if (!get().loaded) set({ loaded: true });
  },
  select: (selected) => {
    // The repair button lives in the panel of the selected module. If selection moves away
    // mid-hold (e.g. a second finger taps the canvas), the button unmounts without a
    // pointerup, so cancel the hold here or it would complete on its own.
    if (selected !== get().selected) get().dispatchHold({ type: 'cancel', now: performance.now() });
    set({ selected });
    if (selected !== null) get().dispatchFeedback({ type: 'moduleTapped' });
  },
  dispatchHold: (event) => {
    const { ui, send } = reduceHold(get().repair, event);
    if (ui !== get().repair) set({ repair: ui });
    if (send) sender?.(send);
  },
  dispatchFeedback: (event) => {
    const next = reduceFeedback(get().feedback, event);
    if (next !== get().feedback) set({ feedback: next });
  },
}));

// ---- selectors: tracks `feel` and `scene` read these; track `share` implements them ----

/** True while the server reports a fault (only the generator can break in this milestone). */
export function selectFaulted(s: Store): boolean {
  return s.sync.base?.fault != null;
}

/** `fault` when the current fault is on module `id`, else `ok` (also `ok` before the first snapshot). */
export function selectModuleStatus(s: Store, id: BaseModuleId): 'fault' | 'ok' {
  return s.sync.base?.fault?.moduleId === id ? 'fault' : 'ok';
}
