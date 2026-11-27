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
  HISTORY_BLACKOUTS,
  SNAPSHOT_BLACKOUTS,
  type Blackout,
  type BlackoutEnd,
  type BlackoutRecord,
  type BlackoutStart,
  type Fault,
  type HistoryResponse,
  type LastRepair,
  type SnapshotMessage,
} from '../shared/protocol';

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

/** What `BaseRoom` stores under `base:v2`, as one object. */
export interface BaseState {
  /** Oldest first. At most one per module, at most `MAX_FAULTS`. */
  faults: Fault[];
  repairs: number;
  /** +1 on every change a client can see (faults, repairs, uptime, blackout, history, lastRepair). */
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
  void instanceId;
  void now;
  void rng;
  throw new Error('TODO(server): initialState');
}

/**
 * Builds `base:v2` from the old `base` object (plan 006 A.2): keeps `repairs`, `instanceId` and the
 * generator fault; `version = legacy.version + 1` (so an old tab, which drops lower versions,
 * accepts the first protocol-1 snapshot); `lastSavedAt` and `uptimeStartedAt` = now (no burst of
 * unattended faults right after the migration); `longestUptimeMs` 0, `blackout` null,
 * `blackouts` [], `lastRepair` null, `nextFaultAt = now + nextFaultDelayMs`. Does not touch `legacy`.
 */
export function migrateLegacy(legacy: LegacyState, now: number, rng: Rng): BaseState {
  void legacy;
  void now;
  void rng;
  throw new Error('TODO(server): migrateLegacy');
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
  void state;
  void now;
  void rng;
  throw new Error('TODO(server): injectFault');
}

export interface RepairResult {
  state: BaseState;
  fault: Fault;
  /** Set when this repair (of the generator) ended the blackout. */
  blackoutEnd: BlackoutEnd | null;
}

/**
 * Repairs `faultId` (plan 006 A.5, A.6). Null unless it is in `faults` now, so a repeat or stale
 * repair changes nothing. Otherwise: removes that fault only, `repairs + 1`, `version + 1`,
 * `lastRepair = { moduleId, at: now }`, `nextFaultAt = now + delay`.
 * Generator during a blackout: the blackout ends (`blackout` null, the record's `endedAt = now`),
 * `uptimeStartedAt = now`; `blackoutEnd` carries those and `longestUptimeMs`.
 */
export function repair(state: BaseState, faultId: string, now: number, rng: Rng): RepairResult | null {
  void state;
  void faultId;
  void now;
  void rng;
  throw new Error('TODO(server): repair');
}

/**
 * When the alarm fires: `injectFault` only if someone is connected, `nextFaultAt` is not null and
 * has passed. An early alarm (for a hold expiry) or a retried alarm after the cap does nothing here.
 */
export function decideOnAlarm(state: BaseState, connections: number, now: number): 'injectFault' | 'none' {
  void state;
  void connections;
  void now;
  throw new Error('TODO(server): decideOnAlarm');
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
 * Always returns a new state (`lastSavedAt = now`).
 */
export function arrive(state: BaseState, now: number, rng: Rng): ArriveResult {
  void state;
  void now;
  void rng;
  throw new Error('TODO(server): arrive');
}

/** Connections went 1 → 0: only `lastSavedAt = now`, so the stay is not counted as unattended. */
export function leave(state: BaseState, now: number): BaseState {
  void state;
  void now;
  throw new Error('TODO(server): leave');
}

/**
 * The one time the alarm should fire (plan 006 A.9, neon (c)): the earlier of `nextFaultAt` and
 * the earliest hold expiry, skipping nulls. Null when both are null.
 */
export function plannedAlarmAt(state: BaseState, earliestHoldExpiry: number | null): number | null {
  void state;
  void earliestHoldExpiry;
  throw new Error('TODO(server): plannedAlarmAt');
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
  void facts;
  throw new Error('TODO(server): decideAlarm');
}

/** Open sockets, leaving out `closing` (in close/error callbacks it may still be listed). */
export function countPresence<T>(sockets: readonly T[], closing?: T): number {
  return closing === undefined ? sockets.length : sockets.filter((s) => s !== closing).length;
}

/** Protocol-2 snapshot: the `SNAPSHOT_BLACKOUTS` newest records, `protocol: 2`, `serverNow`. */
export function toSnapshot(state: BaseState, presence: number, serverNow: number): SnapshotMessage {
  void state;
  void presence;
  void serverNow;
  void SNAPSHOT_BLACKOUTS;
  throw new Error('TODO(server): toSnapshot');
}

/** `GET /api/history`: uptime, the blackout in progress and up to `HISTORY_BLACKOUTS` records. */
export function toHistory(state: BaseState, serverNow: number): HistoryResponse {
  void state;
  void serverNow;
  void HISTORY_BLACKOUTS;
  throw new Error('TODO(server): toHistory');
}
