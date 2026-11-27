/**
 * Messages shared by the client and the Worker. Single source of truth.
 *
 * The types below are the contract between the server task (S) and the client task (C) of plan 003
 * (`docs/plans/003-tasks.md`). Changing a type here needs both sides and the dev lead to agree.
 */

/** Largest client message the server accepts, in UTF-8 bytes. */
export const MAX_CLIENT_MESSAGE_BYTES = 256;

/** Client messages allowed per socket per second; the rest are ignored. */
export const MAX_CLIENT_MESSAGES_PER_SECOND = 5;

/**
 * Heartbeat. These are raw text frames, not JSON. The server answers `PING` with `PONG` through
 * `ctx.setWebSocketAutoResponse`, so it never wakes the Durable Object.
 */
export const PING = 'ping';
export const PONG = 'pong';
/** The client sends `PING` this often. */
export const PING_INTERVAL_MS = 20_000;
/** The client drops and reconnects the socket when no `PONG` arrives within this time. */
export const PONG_TIMEOUT_MS = 10_000;

/** The only module in this milestone. */
export type ModuleId = 'generator';
export const GENERATOR: ModuleId = 'generator';

export interface Fault {
  /** Unique per fault; a repair must name it. */
  id: string;
  moduleId: ModuleId;
  /** Epoch milliseconds. */
  createdAt: number;
}

// ---- server -> client ----

/**
 * Full base state. Sent first on every connection, and returned as JSON by `GET /api/base`.
 * `version` covers `fault` and `repairs` only; `presence` is not versioned.
 */
export interface SnapshotMessage {
  type: 'snapshot';
  version: number;
  fault: Fault | null;
  /** Total repairs since the base was created. */
  repairs: number;
  /** Open sockets right now. */
  presence: number;
  /** Random id stored once per Durable Object; differs across isolated environments. Not shown in the UI. */
  instanceId: string;
}

/** A new fault appeared. */
export interface FaultMessage {
  type: 'fault';
  version: number;
  fault: Fault;
}

/** The fault `faultId` was repaired; the base now has no fault. */
export interface RepairedMessage {
  type: 'repaired';
  version: number;
  faultId: string;
  /** Total repairs after this one. */
  repairs: number;
  /**
   * True only on the socket whose request made this repair count (plan 005 D.11); false on every
   * other socket, and on any socket without an id. A message without `mine` parses as false.
   */
  mine: boolean;
}

/** Open sockets right now. Not versioned: the client always takes the latest value. */
export interface PresenceMessage {
  type: 'presence';
  count: number;
}

export type ServerMessage = SnapshotMessage | FaultMessage | RepairedMessage | PresenceMessage;

// ---- client -> server ----

export interface RepairRequest {
  type: 'repair';
  faultId: string;
}

export type ClientMessage = RepairRequest;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function parseFault(v: unknown): Fault | null {
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

/**
 * Parses a message from the server (WS frame or `/api/base` body).
 * Returns null for invalid JSON, unknown `type`, or missing/mistyped fields. Unknown extra fields are dropped.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
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

/**
 * Parses a message from a client. Returns null when the frame is binary, larger than
 * `MAX_CLIENT_MESSAGE_BYTES` (UTF-8 bytes), invalid JSON, an unknown `type`, or a `repair` whose
 * `faultId` is not a non-empty string. Unknown extra fields are dropped.
 */
export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  if (new TextEncoder().encode(raw).byteLength > MAX_CLIENT_MESSAGE_BYTES) return null;
  const m = parseJson(raw);
  if (!isRecord(m) || m.type !== 'repair') return null;
  if (typeof m.faultId !== 'string' || m.faultId === '') return null;
  return { type: 'repair', faultId: m.faultId };
}
