/**
 * Client store (plan 006). It mirrors server state through the pure reducers; it never changes the
 * base itself. Track `client` of `docs/plans/006-tasks.md` implements the TODO bodies; track
 * `scene` reads it only through the selectors at the bottom, `selected`, `select` and `feedback.effect`.
 */
import { create } from 'zustand';
import type { ClientMessage, Fault, ModuleId, ServerMessage, SnapshotMessage } from '../shared/protocol';
import { classifyRepaired, initialFeedback, reduceFeedback, type FeedbackEvent, type FeedbackState } from './feedback';
import { initialRepairUi, reduceHold, type HoldEvent, type RepairUi } from './hold';
import type { BaseModuleId } from './modules';
import { hudReady } from './ui/view';
import {
  applyRestSnapshot,
  applyServerMessage,
  initialSync,
  markIncompatible as markSyncIncompatible,
  serverNow,
  type ConnectionStatus,
  type SyncState,
} from './sync';

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
    const prev = get();
    const sync = applyServerMessage(prev.sync, msg, dateNow);
    let { repair, feedback } = prev;
    const outbox: ClientMessage[] = [];
    const feed = (event: HoldEvent) => {
      const r = reduceHold(repair, event);
      repair = r.ui;
      if (r.send) outbox.push(r.send);
    };
    const changed = sync.base !== prev.sync.base;
    if (msg.type === 'repaired' && changed) {
      const outcome = classifyRepaired(repair.hold, msg);
      feedback = reduceFeedback(feedback, { type: 'repaired', outcome, moduleId: msg.moduleId, now });
      feed({ type: 'repaired', faultId: msg.faultId, now });
    } else if (msg.type === 'fault' && changed) {
      feedback = reduceFeedback(feedback, { type: 'fault', moduleId: msg.fault.moduleId, now });
    } else if (msg.type === 'snapshot') {
      feed({ type: 'snapshot', now });
    }
    if (msg.type === 'snapshot' || msg.type === 'fault' || msg.type === 'repaired') {
      feed({ type: 'faults', ids: (sync.base?.faults ?? []).map((f) => f.id), now });
    }
    set({ sync, repair, feedback });
    for (const m of outbox) sendToServer(m);
  },
  applyRest: (snap, dateNow) => {
    const sync = applyRestSnapshot(get().sync, snap, dateNow);
    if (sync !== get().sync) set({ sync });
  },
  markIncompatible: () => {
    const sync = markSyncIncompatible(get().sync);
    if (sync !== get().sync) set({ sync });
  },
  setConnection: (connection) => set({ connection }),
  setLoaded: () => {
    if (!get().loaded) set({ loaded: true });
  },
  select: (id) => {
    const prev = get();
    if (id !== prev.selected) get().dispatchHold({ type: 'cancel', now: performance.now() });
    const patch: Partial<Store> = { selected: id };
    if (id !== null) {
      patch.historyOpen = false;
      patch.feedback = reduceFeedback(get().feedback, { type: 'moduleTapped' });
    }
    set(patch);
  },
  openHistory: (open) => {
    if (open) get().dispatchHold({ type: 'cancel', now: performance.now() });
    set(open ? { historyOpen: true, selected: null } : { historyOpen: false });
  },
  dispatchHold: (event) => {
    const r = reduceHold(get().repair, event);
    if (r.ui !== get().repair) set({ repair: r.ui });
    if (r.send) sendToServer(r.send);
  },
  dispatchFeedback: (event) => {
    const feedback = reduceFeedback(get().feedback, event);
    if (feedback !== get().feedback) set({ feedback });
  },
}));

// ---- selectors: the scene track reads these; every one returns a stable value for unchanged state ----

const NO_FAULTS: readonly Fault[] = [];

/** Current faults, oldest first (`NO_FAULTS` before the first snapshot). Same array until it changes. */
export function selectFaults(s: Store): readonly Fault[] {
  return s.sync.base?.faults ?? NO_FAULTS;
}

/** The fault on module `id`, or null. */
export function selectModuleFault(s: Store, id: ModuleId): Fault | null {
  return s.sync.base?.faults.find((f) => f.moduleId === id) ?? null;
}

/** `fault` when module `id` has a fault, else `ok` (also `ok` before the first snapshot). */
export function selectModuleStatus(s: Store, id: ModuleId): 'fault' | 'ok' {
  return selectModuleFault(s, id) ? 'fault' : 'ok';
}

/** True while any module is broken. */
export function selectAnyFault(s: Store): boolean {
  return (s.sync.base?.faults.length ?? 0) > 0;
}

/** True during a blackout. */
/** Scene and base are in (`hudReady`): before that, no state is shown (playtest #47). */
export function selectReady(s: Store): boolean {
  return hudReady({ loaded: s.loaded, hasBase: s.sync.base !== null, incompatible: s.sync.incompatible });
}

/**
 * The first snapshot is in and compatible, whether or not the scene has finished loading. Labels
 * mount on this (hidden until `selectReady`) so `Html`'s separate React root is already rendered
 * when the HUD appears (#61); showing them still waits for `selectReady`.
 */
export function selectBaseIn(s: Store): boolean {
  return s.sync.base !== null && !s.sync.incompatible;
}

export function selectBlackout(s: Store): boolean {
  return (s.sync.base?.blackout ?? null) !== null;
}

/**
 * Other people holding the repair on module `id`'s fault right now: `activity[fault.id]` as the
 * server sent it (it already left this tab out; never subtract this tab's own hold). 0 without a fault.
 */
export function selectOthersHolding(s: Store, id: ModuleId): number {
  const fault = selectModuleFault(s, id);
  return fault ? (s.sync.activity[fault.id] ?? 0) : 0;
}

/** faultId → others holding, as last received (stable object). */
export function selectActivity(s: Store): Readonly<Record<string, number>> {
  return s.sync.activity;
}

/** Server time (epoch ms) for `dateNow = Date.now()`, for sensors and "N초 전" in the scene and UI. */
export function selectServerNow(s: Store, dateNow: number): number {
  return serverNow(s.sync, dateNow);
}
