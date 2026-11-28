/**
 * Messages shared by the client and the Worker. Single source of truth.
 *
 * Protocol 2 (plan 006 B). Owned by the dev lead; the server track and the client track of
 * `docs/plans/006-tasks.md` both build on it. Changing a type here needs the lead and both tracks.
 *
 * Protocol 1 (plans 003-005) is still spoken to sockets that connect without `?protocol=2` (tabs
 * opened before the deploy). Its message shapes are `Legacy*` below; the server only ever *sends*
 * them, so there is no legacy parser here (the deployed one lives in `shared/testdata/v1.ts`).
 */

import { clampParts } from './parts';

/** The protocol this build speaks. Sent in every snapshot and in the WebSocket URL query. */
export const PROTOCOL_VERSION = 2;
/** Query parameter on `/ws` that carries the client's protocol (`/ws?protocol=2`). */
export const PROTOCOL_PARAM = 'protocol';

/** Largest client message the server accepts, in UTF-8 bytes. */
export const MAX_CLIENT_MESSAGE_BYTES = 256;

/** `hold`, `repair` and `collect` allowed per socket per second; the rest are ignored. `release` is never limited. */
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

/** The five modules of the base. Each can break; at most one fault per module. */
export type ModuleId = 'generator' | 'oxygen' | 'greenhouse' | 'comms' | 'habitat';
export const GENERATOR = 'generator' satisfies ModuleId;
/** Generator first (center of the base), then the ring around it. Also the relight order after a blackout. */
export const MODULE_IDS: readonly ModuleId[] = ['generator', 'oxygen', 'greenhouse', 'comms', 'habitat'];

/** Faults at once, base-wide. Reaching it starts a blackout (one of them is always the generator). */
export const MAX_FAULTS = 3;

/** Blackouts in a snapshot (the record panel). The server keeps more (`/api/history`). */
export const SNAPSHOT_BLACKOUTS = 5;
/** Blackouts kept in storage and returned by `/api/history`. */
export const HISTORY_BLACKOUTS = 20;

export function isModuleId(v: unknown): v is ModuleId {
  return typeof v === 'string' && (MODULE_IDS as readonly string[]).includes(v);
}

export interface Fault {
  /** Unique per fault; a repair or hold must name it. */
  id: string;
  moduleId: ModuleId;
  /** Epoch ms (server clock). Faults made while nobody was here carry the time they would have broken. */
  createdAt: number;
}

/** The blackout in progress. */
export interface Blackout {
  id: string;
  /** Epoch ms. */
  startedAt: number;
}

/** One blackout in the history, newest first in every list. */
export interface BlackoutRecord {
  id: string;
  startedAt: number;
  /** null while it is still going on. */
  endedAt: number | null;
}

/** The latest repair, base-wide (HUD `마지막 수리` before this tab saw one itself). */
export interface LastRepair {
  moduleId: ModuleId;
  /** Epoch ms. */
  at: number;
}

// ---- server -> client (protocol 2) ----

/**
 * Full base state. Sent first on every protocol-2 connection, and returned by `GET /api/base`.
 * `version` rises on every change to anything here except `presence` and `serverNow`.
 */
export interface SnapshotMessage {
  type: 'snapshot';
  /** Always `PROTOCOL_VERSION` from this server. A client that reads another value locks repairs. */
  protocol: number;
  version: number;
  /** At most one per module, at most `MAX_FAULTS`. Order: oldest first. */
  faults: Fault[];
  /** Total repairs since the base was created. */
  repairs: number;
  /** Start of the current uptime record; null during a blackout. */
  uptimeStartedAt: number | null;
  /** Longest finished uptime record, ms. The current run may already be longer (the client shows the max). */
  longestUptimeMs: number;
  blackout: Blackout | null;
  /** Up to `SNAPSHOT_BLACKOUTS`, newest first. */
  blackouts: BlackoutRecord[];
  lastRepair: LastRepair | null;
  /** Open sockets right now (both protocols). */
  presence: number;
  /** Random id stored once per Durable Object; differs across isolated environments. Not shown in the UI. */
  instanceId: string;
  /** Server clock when the snapshot was made (epoch ms). The client derives its clock offset from it. */
  serverNow: number;
  /**
   * Parts in the shared store, 0..`PARTS_CAP` (`shared/parts.ts`, plan 009 A.5). A snapshot
   * without it (a server from before 009) parses as 0.
   */
  parts: number;
  /** Slot of the last piece collected (`shared/parts.ts` `partSlot`); -1 for none or when missing. */
  lastPartSlot: number;
}

/** What a `fault` carries when that fault started a blackout (plan 006 A.4, B.11). */
export interface BlackoutStart {
  blackout: Blackout;
  /** The uptime record ended. */
  uptimeStartedAt: null;
  /** Updated with the run that just ended. */
  longestUptimeMs: number;
  /** The new history entry (`endedAt: null`), to put at the front of the local list. */
  record: BlackoutRecord;
}

/** A new fault appeared. */
export interface FaultMessage {
  type: 'fault';
  version: number;
  fault: Fault;
  /** Set only when this fault started a blackout. */
  blackoutStart: BlackoutStart | null;
}

/** What a `repaired` carries when that repair (of the generator) ended the blackout. */
export interface BlackoutEnd {
  /** The record whose `endedAt` to fill. */
  blackoutId: string;
  endedAt: number;
  /** New uptime record, decided by the server (clients recount from this, not from receipt time). */
  uptimeStartedAt: number;
  longestUptimeMs: number;
}

/** The fault `faultId` was repaired. Other faults stay. */
export interface RepairedMessage {
  type: 'repaired';
  version: number;
  faultId: string;
  moduleId: ModuleId;
  /** Total repairs after this one. */
  repairs: number;
  /** True only on the socket whose request made this repair count. A missing `mine` parses as false. */
  mine: boolean;
  /**
   * True on the other sockets that were holding this fault (hold not expired) when the repair
   * counted (#56). Never together with `mine`. A missing `helped` parses as false.
   */
  helped: boolean;
  /** How many sockets got `helped: true`; the same on every socket. A missing or malformed one parses as 0. */
  helpers: number;
  /** Server time of the repair (the new `lastRepair.at`). */
  at: number;
  /** Set only when this repair ended the blackout. */
  blackoutEnd: BlackoutEnd | null;
  /** Parts left in the store after this repair (plan 009 A.4). Null when the server did not say (before 009). */
  parts: number | null;
  /** Server clock when the repair counted, for the clock offset (plan 009 R5). Null when missing. */
  serverNow: number | null;
}

/** Someone collected the piece of `slot` (plan 009 A.3). Versioned: `version` rose with it. */
export interface PartsMessage {
  type: 'parts';
  version: number;
  /** Parts in the store now. */
  count: number;
  /** The slot whose piece was collected (the new `lastPartSlot`). */
  slot: number;
  /** True only on the socket whose `collect` counted. A missing `mine` parses as false. */
  mine: boolean;
  /** Server clock when it counted, for the clock offset (plan 009 R5). */
  serverNow: number;
}

/** Sent only to the socket whose repair was turned away; the base did not change (plan 009 A.4). */
export interface RepairRejectedMessage {
  type: 'repairRejected';
  faultId: string;
  reason: 'noParts';
}

/**
 * How many *other* people hold the repair button on each fault right now. The server builds it per
 * socket and leaves out the receiver's own hold, so the client never subtracts anything.
 * Only counts >= 1 appear. Not versioned: the latest one wins.
 */
export interface ActivityMessage {
  type: 'activity';
  holds: Record<string, number>;
}

/** Open sockets right now. Not versioned: the client always takes the latest value. */
export interface PresenceMessage {
  type: 'presence';
  count: number;
}

export type ServerMessage =
  | SnapshotMessage
  | FaultMessage
  | RepairedMessage
  | ActivityMessage
  | PresenceMessage
  | PartsMessage
  | RepairRejectedMessage;

/** `GET /api/history`. Pure read. */
export interface HistoryResponse {
  uptimeStartedAt: number | null;
  longestUptimeMs: number;
  blackout: Blackout | null;
  /** Up to `HISTORY_BLACKOUTS`, newest first. */
  blackouts: BlackoutRecord[];
  serverNow: number;
}

// ---- server -> client (protocol 1, sockets without `?protocol=2`) ----

/** Snapshot shape the pre-006 client parses. `fault` is the generator fault only. */
export interface LegacySnapshotMessage {
  type: 'snapshot';
  version: number;
  fault: Fault | null;
  repairs: number;
  presence: number;
  instanceId: string;
}

/** Sent to protocol-1 sockets only when the generator fault was repaired. */
export interface LegacyRepairedMessage {
  type: 'repaired';
  version: number;
  faultId: string;
  repairs: number;
  mine: boolean;
}

/** Everything a protocol-1 socket may receive. No `fault`, `activity`, `parts` or `repairRejected` go to it. */
export type LegacyServerMessage = LegacySnapshotMessage | LegacyRepairedMessage | PresenceMessage;

// ---- client -> server ----

export interface RepairRequest {
  type: 'repair';
  faultId: string;
}

/** The repair button went down on `faultId`. */
export interface HoldRequest {
  type: 'hold';
  faultId: string;
}

/** The repair button went up or the hold was cancelled. */
export interface ReleaseRequest {
  type: 'release';
  faultId: string;
}

/** The piece of `slot` was tapped (plan 009 A.3). */
export interface CollectRequest {
  type: 'collect';
  slot: number;
}

export type ClientMessage = RepairRequest | HoldRequest | ReleaseRequest | CollectRequest;

// ---- parsing ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isTime(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v !== '';
}

function parseFault(v: unknown): Fault | null {
  if (!isRecord(v)) return null;
  const { id, moduleId, createdAt } = v;
  if (!isId(id) || !isModuleId(moduleId) || !isTime(createdAt)) return null;
  return { id, moduleId, createdAt };
}

function parseList<T>(v: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) {
    const parsed = parse(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseBlackout(v: unknown): Blackout | null {
  if (!isRecord(v) || !isId(v.id) || !isTime(v.startedAt)) return null;
  return { id: v.id, startedAt: v.startedAt };
}

function parseRecord(v: unknown): BlackoutRecord | null {
  if (!isRecord(v) || !isId(v.id) || !isTime(v.startedAt)) return null;
  const { endedAt } = v;
  if (endedAt !== null && !isTime(endedAt)) return null;
  return { id: v.id, startedAt: v.startedAt, endedAt };
}

function parseLastRepair(v: unknown): LastRepair | null {
  if (!isRecord(v) || !isModuleId(v.moduleId) || !isTime(v.at)) return null;
  return { moduleId: v.moduleId, at: v.at };
}

/** Returns `undefined` for "invalid"; `null` (or a missing field) is a valid "none". */
function optional<T>(v: unknown, parse: (v: unknown) => T | null): T | null | undefined {
  if (v === null || v === undefined) return null;
  return parse(v) ?? undefined;
}

function parseBlackoutStart(v: unknown): BlackoutStart | null {
  if (!isRecord(v) || v.uptimeStartedAt !== null || !isCount(v.longestUptimeMs)) return null;
  const blackout = parseBlackout(v.blackout);
  const record = parseRecord(v.record);
  if (!blackout || !record) return null;
  return { blackout, uptimeStartedAt: null, longestUptimeMs: v.longestUptimeMs, record };
}

function parseBlackoutEnd(v: unknown): BlackoutEnd | null {
  if (!isRecord(v) || !isId(v.blackoutId) || !isTime(v.endedAt)) return null;
  if (!isTime(v.uptimeStartedAt) || !isCount(v.longestUptimeMs)) return null;
  return {
    blackoutId: v.blackoutId,
    endedAt: v.endedAt,
    uptimeStartedAt: v.uptimeStartedAt,
    longestUptimeMs: v.longestUptimeMs,
  };
}

function parseHolds(v: unknown): Record<string, number> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, number> = {};
  for (const [faultId, count] of Object.entries(v)) {
    if (faultId === '' || !isCount(count)) return null;
    if (count > 0) out[faultId] = count;
  }
  return out;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseSnapshot(m: Record<string, unknown>): SnapshotMessage | null {
  if (m.protocol !== PROTOCOL_VERSION) return null;
  const { version, repairs, presence, longestUptimeMs, instanceId, serverNow, uptimeStartedAt } = m;
  if (!isCount(version) || !isCount(repairs) || !isCount(presence) || !isCount(longestUptimeMs)) return null;
  if (typeof instanceId !== 'string' || !isTime(serverNow)) return null;
  if (uptimeStartedAt !== null && !isTime(uptimeStartedAt)) return null;
  const faults = parseList(m.faults, parseFault);
  const blackouts = parseList(m.blackouts, parseRecord);
  const blackout = optional(m.blackout, parseBlackout);
  const lastRepair = optional(m.lastRepair, parseLastRepair);
  if (!faults || !blackouts || blackout === undefined || lastRepair === undefined) return null;
  return {
    type: 'snapshot',
    protocol: PROTOCOL_VERSION,
    version,
    faults,
    repairs,
    uptimeStartedAt,
    longestUptimeMs,
    blackout,
    blackouts,
    lastRepair,
    presence,
    instanceId,
    serverNow,
    parts: partsCount(m.parts) ?? 0,
    lastPartSlot: isSlot(m.lastPartSlot) ? m.lastPartSlot : -1,
  };
}

/** A store count cut to 0..`PARTS_CAP` (`clampParts`), or null when it is not an integer. */
const partsCount = clampParts;

/** A slot number or -1 (none). */
function isSlot(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= -1;
}

/**
 * Parses a protocol-2 message from the server (WS frame or `/api/base` body).
 * Returns null for invalid JSON, unknown `type`, missing or mistyped fields, or a snapshot whose
 * `protocol` is not `PROTOCOL_VERSION`. Unknown extra fields are dropped. A missing `blackoutStart`
 * or `blackoutEnd` reads as null; a present but malformed one rejects the message. The fields added
 * by plan 009 (`parts`, `lastPartSlot`, `serverNow` on `repaired`) read as their "none" value when
 * missing or malformed, so a server from before 009 (a rollback) still parses.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  const m = parseJson(raw);
  if (!isRecord(m)) return null;
  switch (m.type) {
    case 'snapshot':
      return parseSnapshot(m);
    case 'fault': {
      const fault = parseFault(m.fault);
      const blackoutStart = optional(m.blackoutStart, parseBlackoutStart);
      if (!fault || !isCount(m.version) || blackoutStart === undefined) return null;
      return { type: 'fault', version: m.version, fault, blackoutStart };
    }
    case 'repaired': {
      const { version, repairs, faultId, moduleId, at } = m;
      if (!isCount(version) || !isCount(repairs) || !isId(faultId) || !isModuleId(moduleId) || !isTime(at)) {
        return null;
      }
      const blackoutEnd = optional(m.blackoutEnd, parseBlackoutEnd);
      if (blackoutEnd === undefined) return null;
      return {
        type: 'repaired',
        version,
        faultId,
        moduleId,
        repairs,
        mine: m.mine === true,
        helped: m.helped === true,
        helpers: isCount(m.helpers) ? m.helpers : 0,
        at,
        blackoutEnd,
        parts: partsCount(m.parts),
        serverNow: isTime(m.serverNow) ? m.serverNow : null,
      };
    }
    case 'parts': {
      const { version, slot, serverNow } = m;
      const count = partsCount(m.count);
      if (!isCount(version) || count === null || !isCount(slot) || !isTime(serverNow)) return null;
      return { type: 'parts', version, count, slot, mine: m.mine === true, serverNow };
    }
    case 'repairRejected':
      if (!isId(m.faultId) || m.reason !== 'noParts') return null;
      return { type: 'repairRejected', faultId: m.faultId, reason: 'noParts' };
    case 'activity': {
      const holds = parseHolds(m.holds);
      return holds ? { type: 'activity', holds } : null;
    }
    case 'presence':
      if (!isCount(m.count)) return null;
      return { type: 'presence', count: m.count };
    default:
      return null;
  }
}

/**
 * True when `raw` is a snapshot this build cannot use: a JSON object with `type: 'snapshot'` whose
 * `protocol` differs from `PROTOCOL_VERSION`, or that `parseServerMessage` rejects. The client then
 * locks repairs and shows `새 버전이 나왔어요 · 새로고침` (plan 006 B.13). Anything else is false.
 */
export function isIncompatibleSnapshot(raw: string): boolean {
  const m = parseJson(raw);
  if (!isRecord(m) || m.type !== 'snapshot') return false;
  return parseServerMessage(raw) === null;
}

/** The protocol a socket asked for in its upgrade URL: 2 only for `?protocol=2`, otherwise 1. */
export function socketProtocol(url: URL): 1 | 2 {
  return url.searchParams.get(PROTOCOL_PARAM) === String(PROTOCOL_VERSION) ? 2 : 1;
}

/**
 * Parses a message from a client. Returns null when the frame is binary, larger than
 * `MAX_CLIENT_MESSAGE_BYTES` (UTF-8 bytes), invalid JSON, an unknown `type`, a `repair`/`hold`/
 * `release` whose `faultId` is not a non-empty string, or a `collect` whose `slot` is not a
 * non-negative integer. Unknown extra fields are dropped.
 */
export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  if (new TextEncoder().encode(raw).byteLength > MAX_CLIENT_MESSAGE_BYTES) return null;
  const m = parseJson(raw);
  if (!isRecord(m)) return null;
  if (m.type === 'collect') return isCount(m.slot) ? { type: 'collect', slot: m.slot } : null;
  if (!isId(m.faultId)) return null;
  if (m.type !== 'repair' && m.type !== 'hold' && m.type !== 'release') return null;
  return { type: m.type, faultId: m.faultId };
}
