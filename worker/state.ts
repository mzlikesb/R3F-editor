/**
 * Pure rules for the shared base (plan 006 A). No I/O: `BaseRoom` reads storage and the alarm,
 * calls these, saves, then broadcasts. Randomness and ids come in through `Rng`, the clock through
 * `now`, so every rule is testable. Track `server` of `docs/plans/006-tasks.md` implements the
 * TODO bodies; the dev lead owns the signatures and `state.test.ts`.
 *
 * Every function that returns a *new* state sets `lastSavedAt = now` on it (`BaseRoom` saves
 * every new state it gets). A function that changes nothing returns its input or null, as documented.
 */
import {
  GENERATOR,
  HISTORY_BLACKOUTS,
  MAX_FAULTS,
  MODULE_IDS,
  PROTOCOL_VERSION,
  SNAPSHOT_BLACKOUTS,
  type Blackout,
  type BlackoutEnd,
  type BlackoutRecord,
  type BlackoutStart,
  type Fault,
  type HistoryResponse,
  type LastRepair,
  type ModuleId,
  type SnapshotMessage,
} from '../shared/protocol';
import { PARTS_CAP, PART_EARLY_MS, PART_SLOT_MS, clampParts, partSlot } from '../shared/parts';

/** Next-fault delay is drawn from [REFAULT_MIN_MS, REFAULT_MAX_MS]. */
export const REFAULT_MIN_MS = 20_000;
export const REFAULT_MAX_MS = 40_000;
/** Faults made while nobody was here stop at this many in total (one short of a blackout). */
export const UNATTENDED_FAULT_CAP = 2;
/**
 * Unattended time counts only from this long (plan 006 A.7 + neon after round 3 (a)): a refresh or
 * a short app switch (1→0→1) must not hand out a fault, or reloading would farm repairs.
 * Longer than `REFAULT_MAX_MS`, so whenever it applies at least one fault is due anyway ("최소 1개").
 */
export const MIN_UNATTENDED_MS = 60_000;
/**
 * Arriving (0 → 1) to a base with no fault pulls the next fault in to at most this far out
 * (playtest #47: visitors left before the first 20-40 s fault). Not an immediate fault, so a
 * refresh still hands out nothing on arrival; it only shortens the wait.
 */
export const FIRST_FAULT_WAIT_MS = 5_000;

/**
 * A random healthy module. The `MAX_FAULTS`-th fault goes to the generator while it is healthy.
 * Callers guarantee fewer than `MAX_FAULTS` faults.
 */
function pickModule(faults: readonly Fault[], rand: () => number): ModuleId {
  const broken = new Set(faults.map((f) => f.moduleId));
  if (faults.length === MAX_FAULTS - 1 && !broken.has(GENERATOR)) return GENERATOR;
  const healthy = MODULE_IDS.filter((id) => !broken.has(id));
  return healthy[Math.floor(rand() * healthy.length)]!;
}

/** What `BaseRoom` stores under `base:v2`, as one object. */
export interface BaseState {
  /** Oldest first. At most one per module, at most `MAX_FAULTS`. */
  faults: Fault[];
  repairs: number;
  /** +1 on every change a client can see (faults, repairs, uptime, blackout, history, lastRepair, parts). */
  version: number;
  instanceId: string;
  /** Start of the current uptime record; null during a blackout. */
  uptimeStartedAt: number | null;
  longestUptimeMs: number;
  blackout: Blackout | null;
  /** Newest first, at most `HISTORY_BLACKOUTS`. */
  blackouts: BlackoutRecord[];
  /** When the next fault is due. Null while at `MAX_FAULTS`. */
  nextFaultAt: number | null;
  /** Last save, including the 1→0 save. The unattended span starts here. */
  lastSavedAt: number;
  lastRepair: LastRepair | null;
  /** Parts in the shared store, 0..`PARTS_CAP` (plan 009 A.1). */
  parts: number;
  /** Slot of the last piece collected; -1 before the first. A slot is collected at most once. */
  lastPartSlot: number;
}

/**
 * A stored `base:v2` from before plan 009 has no `parts` or `lastPartSlot`: read them as 0 and -1
 * (plan 009 A.1). Only fills in on read; whoever saves next writes the full shape. Returns `stored`
 * itself when nothing is missing.
 */
export function withPartDefaults(stored: BaseState, now: number): BaseState {
  const raw: Partial<BaseState> = stored;
  const parts = clampParts(raw.parts) ?? 0;
  const slot = Number.isInteger(raw.lastPartSlot) && raw.lastPartSlot! >= -1 ? raw.lastPartSlot! : -1;
  // A slot past the current one (a clock that jumped back, a bad write) would block every piece
  // until then; read it as the current slot.
  const lastPartSlot = Math.min(slot, partSlot(now));
  if (parts === raw.parts && lastPartSlot === raw.lastPartSlot) return stored;
  return { ...stored, parts, lastPartSlot };
}

/** What plans 003-005 stored under the old key `base`. Read once for migration, never written. */
export interface LegacyState {
  fault: Fault | null;
  repairs: number;
  version: number;
  instanceId: string;
}

/** `BaseRoom` passes `{ rand: Math.random, newId: () => crypto.randomUUID() }`. */
export interface Rng {
  /** [0, 1). */
  rand: () => number;
  newId: () => string;
}

/** Delay until the next fault, in [REFAULT_MIN_MS, REFAULT_MAX_MS]. `rand` returns [0, 1). */
export function nextFaultDelayMs(rand: () => number): number {
  return REFAULT_MIN_MS + Math.floor(rand() * (REFAULT_MAX_MS - REFAULT_MIN_MS + 1));
}

/**
 * A fresh base: no faults, no repairs, version 0, uptime starting now, `lastSavedAt = now`,
 * `nextFaultAt = now + nextFaultDelayMs`.
 */
export function initialState(instanceId: string, now: number, rng: Rng): BaseState {
  return {
    faults: [],
    repairs: 0,
    version: 0,
    instanceId,
    uptimeStartedAt: now,
    longestUptimeMs: 0,
    blackout: null,
    blackouts: [],
    nextFaultAt: now + nextFaultDelayMs(rng.rand),
    lastSavedAt: now,
    lastRepair: null,
    parts: 0,
    lastPartSlot: -1,
  };
}

/**
 * Builds `base:v2` from the old `base` object (plan 006 A.2): keeps `repairs`, `instanceId` and the
 * generator fault; `version = legacy.version + 1` (so an old tab, which drops lower versions,
 * accepts the first protocol-1 snapshot); `lastSavedAt` and `uptimeStartedAt` = now (no burst of
 * unattended faults right after the migration); `longestUptimeMs` 0, `blackout` null,
 * `blackouts` [], `lastRepair` null, `nextFaultAt = now + nextFaultDelayMs`. Does not touch `legacy`.
 */
export function migrateLegacy(legacy: LegacyState, now: number, rng: Rng): BaseState {
  return {
    faults: legacy.fault ? [{ ...legacy.fault }] : [],
    repairs: legacy.repairs,
    version: legacy.version + 1,
    instanceId: legacy.instanceId,
    uptimeStartedAt: now,
    longestUptimeMs: 0,
    blackout: null,
    blackouts: [],
    nextFaultAt: now + nextFaultDelayMs(rng.rand),
    lastSavedAt: now,
    lastRepair: null,
    parts: 0,
    lastPartSlot: -1,
  };
}

export interface InjectResult {
  state: BaseState;
  fault: Fault;
  /** Set when this fault was the `MAX_FAULTS`-th and no blackout was in progress. */
  blackoutStart: BlackoutStart | null;
}

/**
 * Adds one fault (plan 006 A.3, A.4). Returns null at `MAX_FAULTS`.
 * - Module: a random healthy one (`rand`); the `MAX_FAULTS`-th fault goes to the generator if it is healthy.
 * - Fault `{ id: newId(), moduleId, createdAt: now }`, appended; `version + 1`.
 * - `nextFaultAt`: now + delay while below `MAX_FAULTS`, else null.
 * - Reaching `MAX_FAULTS` with no blackout: blackout `{ id: newId(), startedAt: now }`, the record
 *   (endedAt null) at the front of `blackouts` (cut to `HISTORY_BLACKOUTS`),
 *   `longestUptimeMs = max(longest, now - uptimeStartedAt)`, `uptimeStartedAt = null`.
 *   Already in a blackout: none of that (a blackout ends only by repairing the generator).
 */
export function injectFault(state: BaseState, now: number, rng: Rng): InjectResult | null {
  if (state.faults.length >= MAX_FAULTS) return null;
  const moduleId = pickModule(state.faults, rng.rand);
  const fault: Fault = { id: rng.newId(), moduleId, createdAt: now };
  const faults = [...state.faults, fault];
  const atCap = faults.length >= MAX_FAULTS;
  const next: BaseState = {
    ...state,
    faults,
    version: state.version + 1,
    nextFaultAt: atCap ? null : now + nextFaultDelayMs(rng.rand),
    lastSavedAt: now,
  };
  if (!atCap || state.blackout !== null) return { state: next, fault, blackoutStart: null };

  const longestUptimeMs =
    state.uptimeStartedAt === null
      ? state.longestUptimeMs
      : Math.max(state.longestUptimeMs, now - state.uptimeStartedAt);
  const blackout: Blackout = { id: rng.newId(), startedAt: now };
  const record: BlackoutRecord = { ...blackout, endedAt: null };
  return {
    state: {
      ...next,
      blackout,
      blackouts: [record, ...state.blackouts].slice(0, HISTORY_BLACKOUTS),
      longestUptimeMs,
      uptimeStartedAt: null,
    },
    fault,
    blackoutStart: { blackout, uptimeStartedAt: null, longestUptimeMs, record },
  };
}

export interface RepairResult {
  state: BaseState;
  fault: Fault;
  /** Set when this repair (of the generator) ended the blackout. */
  blackoutEnd: BlackoutEnd | null;
}

/** How repairs treat the parts store (plan 009 A.9). `BaseRoom` passes its code constant `PARTS_REQUIRED`. */
export interface RepairOptions {
  /** True: a repair takes one part and is turned away at 0. False: parts are left alone. */
  partsRequired: boolean;
}

/**
 * Repairs `faultId` (plan 006 A.5, A.6; plan 009 A.4). Null unless it is in `faults` now, so a
 * repeat or stale repair changes nothing; this is checked first (plan 009 R5), so a second repair
 * of the same fault is null even when the store is empty. Then, with `partsRequired` and no part
 * in the store: `'noParts'`, nothing changes. Otherwise: removes that fault only, `repairs + 1`,
 * `version + 1`, `lastRepair = { moduleId, at: now }`, `nextFaultAt = now + delay`, and with
 * `partsRequired` `parts - 1`.
 * Generator during a blackout: the blackout ends (`blackout` null, the record's `endedAt = now`),
 * `uptimeStartedAt = now`; `blackoutEnd` carries those and `longestUptimeMs`.
 */
export function repair(
  state: BaseState,
  faultId: string,
  now: number,
  rng: Rng,
  opts: { partsRequired: false },
): RepairResult | null;
export function repair(
  state: BaseState,
  faultId: string,
  now: number,
  rng: Rng,
  opts: RepairOptions,
): RepairResult | 'noParts' | null;
export function repair(
  state: BaseState,
  faultId: string,
  now: number,
  rng: Rng,
  opts: RepairOptions,
): RepairResult | 'noParts' | null {
  const fault = state.faults.find((f) => f.id === faultId);
  if (!fault) return null;
  if (opts.partsRequired && state.parts < 1) return 'noParts';
  const next: BaseState = {
    ...state,
    parts: opts.partsRequired ? state.parts - 1 : state.parts,
    faults: state.faults.filter((f) => f.id !== faultId),
    repairs: state.repairs + 1,
    version: state.version + 1,
    lastRepair: { moduleId: fault.moduleId, at: now },
    nextFaultAt: now + nextFaultDelayMs(rng.rand),
    lastSavedAt: now,
  };
  if (fault.moduleId !== GENERATOR || state.blackout === null) return { state: next, fault, blackoutEnd: null };

  const blackoutId = state.blackout.id;
  const ended: BaseState = {
    ...next,
    blackout: null,
    blackouts: state.blackouts.map((r) => (r.id === blackoutId ? { ...r, endedAt: now } : r)),
    uptimeStartedAt: now,
  };
  return {
    state: ended,
    fault,
    blackoutEnd: { blackoutId, endedAt: now, uptimeStartedAt: now, longestUptimeMs: state.longestUptimeMs },
  };
}

/**
 * Whether the piece of `slot` may be collected at `now` (plan 009 A.3, R5): the current slot, the
 * one before (a tap just before the turn), or the next one in the last `PART_EARLY_MS` of the
 * current slot (a client clock a little ahead).
 */
export function slotOpen(slot: number, now: number): boolean {
  const current = partSlot(now);
  if (slot === current || slot === current - 1) return true;
  return slot === current + 1 && (current + 1) * PART_SLOT_MS - now <= PART_EARLY_MS;
}

/**
 * Collects the piece of `slot` (plan 009 A.3). Null (nothing changes) unless `slotOpen`, `slot` is
 * past `lastPartSlot` (each piece once, and never an older one) and the store is below `PARTS_CAP`.
 * Faults and blackouts do not matter. Otherwise `parts + 1`, `lastPartSlot = slot`, `version + 1`.
 */
export function collect(state: BaseState, slot: number, now: number): BaseState | null {
  if (!Number.isInteger(slot) || !slotOpen(slot, now)) return null;
  if (slot <= state.lastPartSlot || state.parts >= PARTS_CAP) return null;
  return {
    ...state,
    parts: state.parts + 1,
    lastPartSlot: slot,
    version: state.version + 1,
    lastSavedAt: now,
  };
}

/**
 * When the alarm fires: `injectFault` only if someone is connected, `nextFaultAt` is not null and
 * has passed. An early alarm (for a hold expiry) or a retried alarm after the cap does nothing here.
 */
export function decideOnAlarm(state: BaseState, connections: number, now: number): 'injectFault' | 'none' {
  if (connections <= 0 || state.nextFaultAt === null || state.nextFaultAt > now) return 'none';
  return 'injectFault';
}

export interface ArriveResult {
  state: BaseState;
  /** Faults made for the unattended span, oldest first (already in `state.faults`). */
  injected: Fault[];
}

/**
 * Connections went 0 → 1 (plan 006 A.7). Runs before the first snapshot is sent.
 * - `elapsed = now - lastSavedAt`. Below `MIN_UNATTENDED_MS`: no faults.
 * - Otherwise walk from `lastSavedAt` in `nextFaultDelayMs` steps; each step at or before `now`
 *   adds a fault (`injectFault` rules for the module) with `createdAt` = that step's time, until the
 *   base has `UNATTENDED_FAULT_CAP` faults in total. Existing faults count; at or above the cap
 *   nothing is added. No blackout can start here.
 * - `uptimeStartedAt` and an ongoing blackout are left as they are.
 * - `nextFaultAt = now + delay` below `MAX_FAULTS`, else null. `version + injected.length`.
 * - Still no fault after that: `nextFaultAt = min(nextFaultAt, now + FIRST_FAULT_WAIT_MS)`.
 * Always returns a new state (`lastSavedAt = now`).
 */
export function arrive(state: BaseState, now: number, rng: Rng): ArriveResult {
  const injected: Fault[] = [];
  let faults = state.faults;
  if (now - state.lastSavedAt >= MIN_UNATTENDED_MS) {
    let at = state.lastSavedAt;
    while (faults.length < UNATTENDED_FAULT_CAP) {
      at += nextFaultDelayMs(rng.rand);
      if (at > now) break;
      const fault: Fault = { id: rng.newId(), moduleId: pickModule(faults, rng.rand), createdAt: at };
      injected.push(fault);
      faults = [...faults, fault];
    }
  }
  return {
    state: {
      ...state,
      faults,
      version: state.version + injected.length,
      nextFaultAt: nextFaultOnArrival(faults.length, now, rng),
      lastSavedAt: now,
    },
    injected,
  };
}

function nextFaultOnArrival(faultCount: number, now: number, rng: Rng): number | null {
  if (faultCount >= MAX_FAULTS) return null;
  const next = now + nextFaultDelayMs(rng.rand);
  return faultCount === 0 ? Math.min(next, now + FIRST_FAULT_WAIT_MS) : next;
}

/** Connections went 1 → 0: only `lastSavedAt = now`, so the stay is not counted as unattended. */
export function leave(state: BaseState, now: number): BaseState {
  return { ...state, lastSavedAt: now };
}

/**
 * The one time the alarm should fire (plan 006 A.9, neon (c)): the earlier of `nextFaultAt` and
 * the earliest hold expiry, skipping nulls. Null when both are null.
 */
export function plannedAlarmAt(state: BaseState, earliestHoldExpiry: number | null): number | null {
  const times = [state.nextFaultAt, earliestHoldExpiry].filter((t): t is number => t !== null);
  return times.length === 0 ? null : Math.min(...times);
}

export type AlarmDecision = { kind: 'set'; at: number } | { kind: 'delete' } | { kind: 'keep' };

/**
 * The single alarm rule, used after every event (connect, message, close, alarm) — this is also the
 * self-heal (neon (c)):
 * - nobody connected: `delete` when an alarm is set, else `keep`;
 * - `planned` null: `keep`;
 * - no alarm (`current` null) or one later than `planned`: `set` at `planned`;
 * - otherwise `keep` (an earlier alarm fires, does nothing, and this rule runs again).
 */
export function decideAlarm(facts: {
  connections: number;
  planned: number | null;
  current: number | null;
}): AlarmDecision {
  if (facts.connections <= 0) return facts.current !== null ? { kind: 'delete' } : { kind: 'keep' };
  if (facts.planned === null) return { kind: 'keep' };
  if (facts.current === null || facts.current > facts.planned) return { kind: 'set', at: facts.planned };
  return { kind: 'keep' };
}

/** Open sockets, leaving out `closing` (in close/error callbacks it may still be listed). */
export function countPresence<T>(sockets: readonly T[], closing?: T): number {
  return closing === undefined ? sockets.length : sockets.filter((s) => s !== closing).length;
}

/** Protocol-2 snapshot: the `SNAPSHOT_BLACKOUTS` newest records, `protocol: 2`, `serverNow`, the parts store. */
export function toSnapshot(state: BaseState, presence: number, serverNow: number): SnapshotMessage {
  return {
    type: 'snapshot',
    protocol: PROTOCOL_VERSION,
    version: state.version,
    faults: state.faults,
    repairs: state.repairs,
    uptimeStartedAt: state.uptimeStartedAt,
    longestUptimeMs: state.longestUptimeMs,
    blackout: state.blackout,
    blackouts: state.blackouts.slice(0, SNAPSHOT_BLACKOUTS),
    lastRepair: state.lastRepair,
    presence,
    instanceId: state.instanceId,
    serverNow,
    parts: state.parts,
    lastPartSlot: state.lastPartSlot,
  };
}

/** `GET /api/history`: uptime, the blackout in progress and up to `HISTORY_BLACKOUTS` records. */
export function toHistory(state: BaseState, serverNow: number): HistoryResponse {
  return {
    uptimeStartedAt: state.uptimeStartedAt,
    longestUptimeMs: state.longestUptimeMs,
    blackout: state.blackout,
    blackouts: state.blackouts.slice(0, HISTORY_BLACKOUTS),
    serverNow,
  };
}
