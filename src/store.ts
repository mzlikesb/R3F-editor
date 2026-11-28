/**
 * Client store (plan 006). It mirrors server state through the pure reducers; it never changes the
 * base itself. Track `client` of `docs/plans/006-tasks.md` implements the TODO bodies; track
 * `scene` reads it only through the selectors at the bottom, `selected`, `select` and `feedback.effect`.
 */
import { create } from 'zustand';
import type { ClientMessage, Fault, ModuleId, ServerMessage, SnapshotMessage } from '../shared/protocol';
import { chromaPulse } from './scene/chroma';
import { classifyRepaired, initialFeedback, reduceFeedback, type FeedbackEvent, type FeedbackState } from './feedback';
import { initialRepairUi, reduceHold, type HoldEvent, type RepairUi } from './hold';
import { partSlot, PART_SLOT_MS } from '../shared/parts';
import {
  PICKUP_TIMEOUT_MS,
  idlePickup,
  initialPing,
  pieceOut,
  pieceShown,
  reducePickup,
  reducePing,
  type PartPing,
  type Pickup,
  type PickupEvent,
} from './parts';
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
   * `now` of the last blackout this tab saw start live (`chromaPulse`), null before one. A snapshot
   * that is already dark (join, reconnect) leaves it alone (008 C.3).
   */
  blackoutLiveAt: number | null;
  /** This tab's pick-up waiting for the server (plan 009 B.2). */
  pickup: Pickup;
  /** The ring ping on the piece, and one waiting for the next piece (B.4). */
  partPing: PartPing;
  /** `부품이 없어요 — 조각을 주워요` under the repair button (B.5). Goes once the store has a part or the selection moves. */
  partsNotice: boolean;
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
   * 6. parts (plan 009): `snapshot` / `parts` feed the pick-up; `repairRejected` of the held fault, or
   *    a hold with the store at 0, feeds hold event `noParts` and raises the notice; a store with a
   *    part drops any waiting ping, and one that just got a part drops the notice.
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
  /** Feeds the pick-up reducer (its timer sends `tick`, the socket `disconnect`). */
  dispatchPickup: (event: PickupEvent) => void;
  /** The piece was tapped: `collect` for the slot of server time, if it is out and the socket open (B.2, R5). */
  collectPiece: (now: number, dateNow: number) => void;
  /** `부품을 먼저 주워요` / `다음 조각 N초`: back to the overview and ping the piece, now or when the next one falls. */
  fetchParts: (dateNow: number) => void;
  /** The timer of a waiting ping: pings the piece once its slot has come. */
  checkPartPing: (dateNow: number) => void;
}

let sender: ((msg: ClientMessage) => void) | null = null;
let pickupTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setTimeout> | undefined;
/** A waiting ping checks again this long after its slot starts. */
const PING_CHECK_SLACK_MS = 30;

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
  blackoutLiveAt: null,
  pickup: idlePickup,
  partPing: initialPing,
  partsNotice: false,
  receive: (msg, now, dateNow) => {
    const prev = get();
    const sync = applyServerMessage(prev.sync, msg, dateNow);
    let { repair, feedback, pickup, partPing, partsNotice } = prev;
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
    if (msg.type === 'snapshot') pickup = reducePickup(pickup, { type: 'snapshot' }).pickup;
    if (msg.type === 'parts') pickup = reducePickup(pickup, msg).pickup;
    const parts = sync.base?.parts ?? 0;
    const rejected =
      msg.type === 'repairRejected' && repair.hold.kind !== 'idle' && repair.hold.faultId === msg.faultId;
    if (rejected || (repair.hold.kind === 'holding' && parts === 0)) {
      feed({ type: 'noParts', now });
      partsNotice = true;
    } else if (msg.type === 'repairRejected') {
      partsNotice = true;
    }
    if (parts >= 1) partPing = reducePing(partPing, { type: 'cancel' });
    // A part came in: the notice has done its job.
    if (parts >= 1 && (prev.sync.base?.parts ?? 0) < 1) partsNotice = false;
    const wasDark = (prev.sync.base?.blackout ?? null) !== null;
    const isDark = (sync.base?.blackout ?? null) !== null;
    const pulse = chromaPulse(wasDark, isDark, msg.type === 'snapshot' ? 'snapshot' : 'live');
    const patch: Partial<Store> = { sync, repair, feedback, pickup, partPing, partsNotice };
    set(pulse ? { ...patch, blackoutLiveAt: now } : patch);
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
    if (id !== prev.selected) patch.partsNotice = false;
    if (id !== null) {
      patch.partPing = reducePing(get().partPing, { type: 'cancel' });
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
  dispatchPickup: (event) => {
    const r = reducePickup(get().pickup, event);
    if (r.pickup !== get().pickup) set({ pickup: r.pickup });
    if (r.send) sendToServer(r.send);
  },
  collectPiece: (now, dateNow) => {
    const { sync, connection, pickup } = get();
    const slot = partSlot(serverNow(sync, dateNow));
    if (!pieceShown(sync.base, slot, pickup)) return;
    const allowed = connection === 'open' && sync.wsSynced && !sync.incompatible;
    get().dispatchPickup({ type: 'tap', slot, now, allowed });
    if (get().pickup === pickup) return;
    clearTimeout(pickupTimer);
    pickupTimer = setTimeout(() => get().dispatchPickup({ type: 'tick', now: performance.now() }), PICKUP_TIMEOUT_MS);
  },
  fetchParts: (dateNow) => {
    get().select(null);
    const { sync, partPing } = get();
    const slot = partSlot(serverNow(sync, dateNow));
    set({ partPing: reducePing(partPing, { type: 'request', slot, out: pieceOut(sync.base, slot) }) });
    schedulePing(dateNow);
  },
  checkPartPing: (dateNow) => {
    const { sync, partPing } = get();
    const slot = partSlot(serverNow(sync, dateNow));
    const next = reducePing(partPing, { type: 'slot', slot, out: pieceOut(sync.base, slot) });
    if (next !== partPing) set({ partPing: next });
    schedulePing(dateNow);
  },
}));

/** Arms the timer of a waiting ping for the start of the slot it waits for (one timer at a time). */
function schedulePing(dateNow: number): void {
  clearTimeout(pingTimer);
  const { sync, partPing } = useStore.getState();
  if (partPing.waitFor === null) return;
  const wait = partPing.waitFor * PART_SLOT_MS - serverNow(sync, dateNow);
  pingTimer = setTimeout(() => useStore.getState().checkPartPing(Date.now()), Math.max(0, wait) + PING_CHECK_SLACK_MS);
}

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
