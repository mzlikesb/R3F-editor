/**
 * Pure reducers that apply server data to the client's copy of the base (plan 003).
 * The client never changes the base itself; it only mirrors what the server says.
 * Contract with task C in `docs/plans/003-tasks.md`.
 */
import type { Fault, ServerMessage, SnapshotMessage } from '../shared/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

/** The versioned part of the base, as last heard from the server. */
export interface BaseView {
  fault: Fault | null;
  repairs: number;
  version: number;
  instanceId: string;
}

export interface SyncState {
  /** null until the first snapshot (REST or WS). */
  base: BaseView | null;
  /** Latest presence count; not versioned. */
  presence: number;
  /** True once any WS snapshot was applied; REST snapshots are ignored from then on. */
  wsSynced: boolean;
}

export const initialSync: SyncState = { base: null, presence: 0, wsSynced: false };

/**
 * Applies a WS message. `snapshot`, `fault` and `repaired` with a lower `version` than the current
 * base are dropped. `presence` always replaces the count. A WS snapshot sets `wsSynced`.
 * Returns `state` itself when nothing changes.
 */
export function applyServerMessage(state: SyncState, msg: ServerMessage): SyncState {
  switch (msg.type) {
    case 'presence':
      return msg.count === state.presence ? state : { ...state, presence: msg.count };
    case 'snapshot': {
      const stale = state.base !== null && msg.version < state.base.version;
      return {
        base: stale
          ? state.base
          : { fault: msg.fault, repairs: msg.repairs, version: msg.version, instanceId: msg.instanceId },
        presence: msg.presence,
        wsSynced: true,
      };
    }
    case 'fault': {
      // The first message of a connection is always a snapshot, so there is no base to build on yet.
      if (!state.base || msg.version < state.base.version) return state;
      return { ...state, base: { ...state.base, fault: msg.fault, version: msg.version } };
    }
    case 'repaired': {
      if (!state.base || msg.version < state.base.version) return state;
      return { ...state, base: { ...state.base, fault: null, repairs: msg.repairs, version: msg.version } };
    }
  }
}

/** Applies the `GET /api/base` response, unless a WS snapshot already arrived or its version is lower. */
export function applyRestSnapshot(state: SyncState, snap: SnapshotMessage): SyncState {
  if (state.wsSynced) return state;
  if (state.base && snap.version < state.base.version) return state;
  return {
    ...state,
    base: { fault: snap.fault, repairs: snap.repairs, version: snap.version, instanceId: snap.instanceId },
    presence: snap.presence,
  };
}

/**
 * The repair button is enabled only when the socket is `open` (which `socket.ts` sets after the
 * snapshot of that connection is applied), a WS snapshot was applied, and there is a fault.
 */
export function canRepair(state: SyncState, connection: ConnectionStatus): boolean {
  return connection === 'open' && state.wsSynced && state.base?.fault != null;
}
