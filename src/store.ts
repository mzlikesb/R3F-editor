/**
 * Client store (plan 006). It mirrors server state through the pure reducers; it never changes the
 * base itself. Track `client` of `docs/plans/006-tasks.md` implements the TODO bodies; track
 * `scene` reads it only through the selectors at the bottom, `selected`, `select` and `feedback.effect`.
 */
import { create } from 'zustand';
import type { ClientMessage, Fault, ModuleId, ServerMessage, SnapshotMessage } from '../shared/protocol';
import { initialFeedback, type FeedbackEvent, type FeedbackState } from './feedback';
import { initialRepairUi, type HoldEvent, type RepairUi } from './hold';
import type { BaseModuleId } from './modules';
import { initialSync, type ConnectionStatus, type SyncState } from './sync';

export interface Store {
  sync: SyncState;
  connection: ConnectionStatus;
  selected: BaseModuleId | null;
  /** The record panel (uptime, blackouts). Never open together with the repair panel. */
  historyOpen: boolean;
  repair: RepairUi;
  feedback: FeedbackState;
  /** The scene finished its first load (models and HDRI, or their fallbacks). Latches. */
  loaded: boolean;
  /**
   * Handles one parsed WS message. `now` is `performance.now()`, `dateNow` is `Date.now()`.
   * 1. `applyServerMessage(sync, msg, dateNow)`;
   * 2. `repaired` that changed the base: classify with `classifyRepaired` from the hold state
   *    *before* step 3, feed `{ type: 'repaired', outcome, moduleId }` to feedback, then hold event
   *    `repaired`; a stale `repaired` does nothing else;
   * 3. `fault` that changed the base: feedback `{ type: 'fault', moduleId }`;
   * 4. `snapshot`: hold event `snapshot`;
   * 5. after every versioned message (`snapshot`, `fault`, `repaired`): hold event `faults` with the
   *    current fault ids (a hold on a fault that is gone is cancelled and its `release` sent, #15-4).
   */
  receive: (msg: ServerMessage, now: number, dateNow: number) => void;
  applyRest: (snap: SnapshotMessage, dateNow: number) => void;
  /** `net/socket.ts` calls this when `isIncompatibleSnapshot(raw)`; repairs lock and the update banner shows. */
  markIncompatible: () => void;
  setConnection: (status: ConnectionStatus) => void;
  /** `ui/Loading.tsx` calls this once the loading overlay goes away. */
  setLoaded: () => void;
  /**
   * Selecting a module opens its panel. Any change of selection cancels a hold in progress (and
   * sends its `release`, #15-4); a non-null selection dismisses the hint and closes the record panel.
   */
  select: (id: BaseModuleId | null) => void;
  /** Opens or closes the record panel; opening it clears the selection (and so cancels a hold). */
  openHistory: (open: boolean) => void;
  /** Feeds the hold state machine; its `send` goes out through the registered sender. */
  dispatchHold: (event: HoldEvent) => void;
  /** Feeds the feedback reducer (the toast's timer sends `tick`). */
  dispatchFeedback: (event: FeedbackEvent) => void;
}

let sender: ((msg: ClientMessage) => void) | null = null;

/** `net/socket.ts` registers how to put a client message on the wire. */
export function setClientSender(fn: ((msg: ClientMessage) => void) | null): void {
  sender = fn;
}

/** For the implementation: sends through the registered sender, if any. */
export function sendToServer(msg: ClientMessage): void {
  sender?.(msg);
}

export const useStore = create<Store>((set, get) => ({
  sync: initialSync,
  connection: 'connecting',
  selected: null,
  historyOpen: false,
  repair: initialRepairUi,
  feedback: initialFeedback,
  loaded: false,
  receive: (msg, now, dateNow) => {
    void msg;
    void now;
    void dateNow;
    throw new Error('TODO(client): store.receive');
  },
  applyRest: (snap, dateNow) => {
    void snap;
    void dateNow;
    throw new Error('TODO(client): store.applyRest');
  },
  markIncompatible: () => {
    throw new Error('TODO(client): store.markIncompatible');
  },
  setConnection: (connection) => set({ connection }),
  setLoaded: () => {
    if (!get().loaded) set({ loaded: true });
  },
  select: (id) => {
    void id;
    throw new Error('TODO(client): store.select');
  },
  openHistory: (open) => {
    void open;
    throw new Error('TODO(client): store.openHistory');
  },
  dispatchHold: (event) => {
    void event;
    throw new Error('TODO(client): store.dispatchHold');
  },
  dispatchFeedback: (event) => {
    void event;
    throw new Error('TODO(client): store.dispatchFeedback');
  },
}));

// ---- selectors: the scene track reads these; every one returns a stable value for unchanged state ----

const NO_FAULTS: readonly Fault[] = [];

/** Current faults, oldest first (`NO_FAULTS` before the first snapshot). Same array until it changes. */
export function selectFaults(s: Store): readonly Fault[] {
  void s;
  void NO_FAULTS;
  throw new Error('TODO(client): selectFaults');
}

/** The fault on module `id`, or null. */
export function selectModuleFault(s: Store, id: ModuleId): Fault | null {
  void s;
  void id;
  throw new Error('TODO(client): selectModuleFault');
}

/** `fault` when module `id` has a fault, else `ok` (also `ok` before the first snapshot). */
export function selectModuleStatus(s: Store, id: ModuleId): 'fault' | 'ok' {
  void s;
  void id;
  throw new Error('TODO(client): selectModuleStatus');
}

/** True while any module is broken. */
export function selectAnyFault(s: Store): boolean {
  void s;
  throw new Error('TODO(client): selectAnyFault');
}

/** True during a blackout. */
export function selectBlackout(s: Store): boolean {
  void s;
  throw new Error('TODO(client): selectBlackout');
}

/**
 * Other people holding the repair on module `id`'s fault right now: `activity[fault.id]` as the
 * server sent it (it already left this tab out; never subtract this tab's own hold). 0 without a fault.
 */
export function selectOthersHolding(s: Store, id: ModuleId): number {
  void s;
  void id;
  throw new Error('TODO(client): selectOthersHolding');
}

/** faultId → others holding, as last received (stable object). */
export function selectActivity(s: Store): Readonly<Record<string, number>> {
  void s;
  throw new Error('TODO(client): selectActivity');
}

/** Server time (epoch ms) for `dateNow = Date.now()`, for sensors and "N초 전" in the scene and UI. */
export function selectServerNow(s: Store, dateNow: number): number {
  void s;
  void dateNow;
  throw new Error('TODO(client): selectServerNow');
}
