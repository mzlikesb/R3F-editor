/**
 * Test fixture: the protocol-1 parser and reducer as deployed before plan 006, copied from `main`
 * at ab8d6ca (`shared/protocol.ts` types and `parseServerMessage`, `src/sync.ts`
 * `applyServerMessage`). Tests feed everything the server sends to a protocol-1 socket through
 * these, to prove a tab opened before the deploy keeps working. Do not change the logic; only the
 * names carry a `V1` / `v1` prefix.
 */

export type V1ModuleId = 'generator';
const GENERATOR: V1ModuleId = 'generator';

export interface V1Fault {
  id: string;
  moduleId: V1ModuleId;
  createdAt: number;
}

export interface V1SnapshotMessage {
  type: 'snapshot';
  version: number;
  fault: V1Fault | null;
  repairs: number;
  presence: number;
  instanceId: string;
}

export interface V1FaultMessage {
  type: 'fault';
  version: number;
  fault: V1Fault;
}

export interface V1RepairedMessage {
  type: 'repaired';
  version: number;
  faultId: string;
  repairs: number;
  mine: boolean;
}

export interface V1PresenceMessage {
  type: 'presence';
  count: number;
}

export type V1ServerMessage = V1SnapshotMessage | V1FaultMessage | V1RepairedMessage | V1PresenceMessage;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function parseFault(v: unknown): V1Fault | null {
  if (!isRecord(v)) return null;
  const { id, moduleId, createdAt } = v;
  if (typeof id !== 'string' || id === '') return null;
  if (moduleId !== GENERATOR) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return { id, moduleId, createdAt };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function v1ParseServerMessage(raw: string): V1ServerMessage | null {
  const m = parseJson(raw);
  if (!isRecord(m)) return null;
  switch (m.type) {
    case 'snapshot': {
      const fault = m.fault === null ? null : parseFault(m.fault);
      if (m.fault !== null && fault === null) return null;
      if (!isCount(m.version) || !isCount(m.repairs) || !isCount(m.presence)) return null;
      if (typeof m.instanceId !== 'string') return null;
      return {
        type: 'snapshot',
        version: m.version,
        fault,
        repairs: m.repairs,
        presence: m.presence,
        instanceId: m.instanceId,
      };
    }
    case 'fault': {
      const fault = parseFault(m.fault);
      if (!fault || !isCount(m.version)) return null;
      return { type: 'fault', version: m.version, fault };
    }
    case 'repaired':
      if (!isCount(m.version) || !isCount(m.repairs)) return null;
      if (typeof m.faultId !== 'string' || m.faultId === '') return null;
      return { type: 'repaired', version: m.version, faultId: m.faultId, repairs: m.repairs, mine: m.mine === true };
    case 'presence':
      if (!isCount(m.count)) return null;
      return { type: 'presence', count: m.count };
    default:
      return null;
  }
}

export interface V1BaseView {
  fault: V1Fault | null;
  repairs: number;
  version: number;
  instanceId: string;
}

export interface V1SyncState {
  base: V1BaseView | null;
  presence: number;
  wsSynced: boolean;
}

export const v1InitialSync: V1SyncState = { base: null, presence: 0, wsSynced: false };

export function v1ApplyServerMessage(state: V1SyncState, msg: V1ServerMessage): V1SyncState {
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
      if (!state.base || msg.version < state.base.version) return state;
      return { ...state, base: { ...state.base, fault: msg.fault, version: msg.version } };
    }
    case 'repaired': {
      if (!state.base || msg.version < state.base.version) return state;
      return { ...state, base: { ...state.base, fault: null, repairs: msg.repairs, version: msg.version } };
    }
  }
}

/** Runs raw frames through the old parser and reducer, the way an old tab would. Unparsed frames are skipped. */
export function v1Replay(frames: readonly string[], start: V1SyncState = v1InitialSync): V1SyncState {
  let state = start;
  for (const raw of frames) {
    const msg = v1ParseServerMessage(raw);
    if (msg) state = v1ApplyServerMessage(state, msg);
  }
  return state;
}
