/**
 * Pure reducers that apply server data to the client's copy of the base (plans 003, 006).
 * The client never changes the base itself; it only mirrors what the server says.
 * Track `client` of `docs/plans/006-tasks.md` implements the TODO bodies.
 */
import {
  SNAPSHOT_BLACKOUTS,
  type Blackout,
  type BlackoutRecord,
  type Fault,
  type ModuleId,
  type ServerMessage,
  type SnapshotMessage,
} from '../shared/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

/** The latest repair. `mine` is null when it came from a snapshot (this tab did not see it happen). */
export interface LastRepairView {
  moduleId: ModuleId;
  /** Server epoch ms. */
  at: number;
  mine: boolean | null;
  /** Others who were holding it when it counted (`repaired.helpers`, #56); 0 from a snapshot. */
  helpers: number;
}

/** The versioned part of the base, as last heard from the server. */
export interface BaseView {
  /** Oldest first. A new array whenever it changes, the same array otherwise (stable for selectors). */
  faults: Fault[];
  repairs: number;
  version: number;
  instanceId: string;
  uptimeStartedAt: number | null;
  longestUptimeMs: number;
  blackout: Blackout | null;
  /** Newest first, at most `SNAPSHOT_BLACKOUTS`. */
  blackouts: BlackoutRecord[];
  lastRepair: LastRepairView | null;
  /** Parts in the shared store, 0..`PARTS_CAP` (plan 009). */
  parts: number;
  /** Slot of the last piece collected; -1 for none. */
  lastPartSlot: number;
}

export interface SyncState {
  /** null until the first snapshot (REST or WS). */
  base: BaseView | null;
  /** Latest presence count; not versioned. */
  presence: number;
  /** True once any WS snapshot was applied; REST snapshots are ignored from then on. */
  wsSynced: boolean;
  /** `serverNow - Date.now()` at the last snapshot, `parts` or `repaired` (R5); add it to `Date.now()` for server time. */
  clockOffsetMs: number;
  /** faultId → other people holding it (the server already left this tab out). Not versioned. */
  activity: Record<string, number>;
  /** The server spoke a protocol this build cannot read. Latches until reload. */
  incompatible: boolean;
}

export const initialSync: SyncState = {
  base: null,
  presence: 0,
  wsSynced: false,
  clockOffsetMs: 0,
  activity: {},
  incompatible: false,
};

/**
 * Applies a WS message. `dateNow` is `Date.now()` at receipt (for the clock offset).
 * - `snapshot`: replaces the base unless its version is lower than the current one, *except* when
 *   its `instanceId` differs (another base: take it whatever the version, #15-1). Sets
 *   `clockOffsetMs`, `presence`, `wsSynced`; clears `activity` (a new connection).
 * - `fault` (version not lower, base known): adds the fault (replacing one with the same id); with
 *   `blackoutStart`: `blackout`, `uptimeStartedAt` null, `longestUptimeMs`, and the record at the
 *   front of `blackouts` (cut to `SNAPSHOT_BLACKOUTS`).
 * - `repaired` (same check): removes that fault, `repairs`, `lastRepair` (`mine`, `helpers` from the message),
 *   `parts` and the clock offset when it carries them;
 *   with `blackoutEnd`: `blackout` null, `uptimeStartedAt`, `longestUptimeMs`, that record's
 *   `endedAt`. Drops the fault from `activity`.
 * - `activity`: replaces `activity`. `presence`: replaces the count.
 * - `parts` (same check): the store count, `lastPartSlot`, `version`, the clock offset (R5).
 * - `repairRejected`: nothing here (the store's hold machine handles it).
 * Returns `state` itself when nothing changes (a stale versioned message).
 */
export function applyServerMessage(state: SyncState, msg: ServerMessage, dateNow: number): SyncState {
  switch (msg.type) {
    case 'snapshot': {
      const known = state.base;
      if (known && known.instanceId === msg.instanceId && msg.version < known.version) return state;
      return {
        ...state,
        base: baseFromSnapshot(msg),
        presence: msg.presence,
        wsSynced: true,
        clockOffsetMs: msg.serverNow - dateNow,
        activity: {},
      };
    }
    case 'fault': {
      const base = state.base;
      if (!base || msg.version < base.version) return state;
      const faults = [...base.faults.filter((f) => f.id !== msg.fault.id), msg.fault];
      const start = msg.blackoutStart;
      const next: BaseView = { ...base, faults, version: msg.version };
      if (start) {
        next.blackout = start.blackout;
        next.uptimeStartedAt = null;
        next.longestUptimeMs = start.longestUptimeMs;
        next.blackouts = [start.record, ...base.blackouts.filter((r) => r.id !== start.record.id)].slice(
          0,
          SNAPSHOT_BLACKOUTS,
        );
      }
      return { ...state, base: next };
    }
    case 'repaired': {
      const base = state.base;
      if (!base || msg.version < base.version) return state;
      const next: BaseView = {
        ...base,
        faults: base.faults.filter((f) => f.id !== msg.faultId),
        repairs: msg.repairs,
        version: msg.version,
        lastRepair: { moduleId: msg.moduleId, at: msg.at, mine: msg.mine, helpers: msg.helpers },
        parts: msg.parts ?? base.parts,
      };
      const end = msg.blackoutEnd;
      if (end) {
        next.blackout = null;
        next.uptimeStartedAt = end.uptimeStartedAt;
        next.longestUptimeMs = end.longestUptimeMs;
        next.blackouts = base.blackouts.map((r) => (r.id === end.blackoutId ? { ...r, endedAt: end.endedAt } : r));
      }
      const activity = Object.fromEntries(Object.entries(state.activity).filter(([id]) => id !== msg.faultId));
      const clockOffsetMs = msg.serverNow === null ? state.clockOffsetMs : msg.serverNow - dateNow;
      return { ...state, base: next, activity, clockOffsetMs };
    }
    case 'activity':
      return { ...state, activity: msg.holds };
    case 'presence':
      return state.presence === msg.count ? state : { ...state, presence: msg.count };
    case 'parts': {
      const base = state.base;
      if (!base || msg.version < base.version) return state;
      return {
        ...state,
        base: { ...base, parts: msg.count, lastPartSlot: Math.max(base.lastPartSlot, msg.slot), version: msg.version },
        clockOffsetMs: msg.serverNow - dateNow,
      };
    }
    case 'repairRejected':
      return state;
  }
}

function baseFromSnapshot(msg: SnapshotMessage): BaseView {
  return {
    faults: msg.faults,
    repairs: msg.repairs,
    version: msg.version,
    instanceId: msg.instanceId,
    uptimeStartedAt: msg.uptimeStartedAt,
    longestUptimeMs: msg.longestUptimeMs,
    blackout: msg.blackout,
    blackouts: msg.blackouts,
    lastRepair: msg.lastRepair ? { ...msg.lastRepair, mine: null, helpers: 0 } : null,
    parts: msg.parts,
    lastPartSlot: msg.lastPartSlot,
  };
}

/** Applies the `GET /api/base` response (sets the clock offset too), unless a WS snapshot already arrived or its version is lower. */
export function applyRestSnapshot(state: SyncState, snap: SnapshotMessage, dateNow: number): SyncState {
  if (state.wsSynced) return state;
  if (state.base && state.base.instanceId === snap.instanceId && snap.version < state.base.version) return state;
  return { ...state, base: baseFromSnapshot(snap), presence: snap.presence, clockOffsetMs: snap.serverNow - dateNow };
}

/** `incompatible` = true (and the same state when it already is). */
export function markIncompatible(state: SyncState): SyncState {
  return state.incompatible ? state : { ...state, incompatible: true };
}

/** Server time now: `dateNow + clockOffsetMs`. */
export function serverNow(state: SyncState, dateNow: number): number {
  return dateNow + state.clockOffsetMs;
}

/**
 * The repair button works only when the socket is `open` (set after that connection's snapshot is
 * applied), a WS snapshot was applied, the protocol is compatible, `faultId` is a current fault and
 * the store has a part (plan 009 A.4).
 */
export function canRepair(state: SyncState, connection: ConnectionStatus, faultId: string): boolean {
  return (
    connection === 'open' &&
    state.wsSynced &&
    !state.incompatible &&
    (state.base?.parts ?? 0) >= 1 &&
    (state.base?.faults.some((f) => f.id === faultId) ?? false)
  );
}
