import { DurableObject } from 'cloudflare:workers';
import { PING, PONG } from '../shared/protocol';

/** Storage key of the whole `BaseState` from plan 006 on (one object, one put). */
export const STATE_KEY = 'base:v2';
/** Plans 003-005 stored `LegacyState` here. Read once to migrate; never written or deleted (rollback). */
export const LEGACY_STATE_KEY = 'base';
/** Key written by plan 002; the `instanceId` of a base that never had `base`. Read only. */
export const INSTANCE_ID_KEY = 'instanceId';

/**
 * The single shared base (plan 006). Rules live in `./state`, `./holds`, `./legacy`; this class does
 * the I/O. Track `server` of `docs/plans/006-tasks.md` writes the bodies; the order of operations
 * below is the contract the integration tests (`worker/test/base.test.ts`) check.
 *
 * - Storage is read on every event (no in-memory copy of `BaseState`), so tests can seed it.
 * - `fetch` `/ws` upgrade: attachment `newAttachment(uuid, socketProtocol(url))`; load (migrating
 *   from `LEGACY_STATE_KEY` if `STATE_KEY` is missing); if this socket made connections 0 → 1, run
 *   `arrive` and save; then send this socket its snapshot (protocol 2: `toSnapshot`, protocol 1:
 *   `toLegacySnapshot`), broadcast `fault` for each `arrive` fault to the other protocol-2 sockets,
 *   `presence` to the others, and finish with the alarm rule.
 * - `fetch` `GET /api/base` / `GET /api/history`: pure reads. No migration write, no `arrive`, no
 *   alarm. A missing `STATE_KEY` is answered from the migrated or initial state without saving.
 * - `webSocketMessage`: parse → `admit` (rate limit; `release` always passes) →
 *   `repair`: `repair()`; on success save, `repaired` to protocol-2 sockets (`mine` per socket),
 *   `legacyUpdate` to protocol-1 sockets, `releaseHold` of that fault on every socket and an
 *   `activity` to protocol-2 sockets if any hold was cleared.
 *   `hold` / `release`: update this socket's attachment (`startHold` / `releaseHold`); if it changed,
 *   send each protocol-2 socket `activityFor(all holds, its own hold)`.
 *   Then the alarm rule.
 * - `alarm`: drop expired holds (`isExpired`, then `activity` if any changed); `decideOnAlarm` →
 *   `injectFault`, save, `fault` to protocol-2 sockets, `legacyUpdate` to protocol-1 sockets. Then
 *   the alarm rule.
 * - `webSocketClose` / `webSocketError`: `presence` to the others; if the closing socket held
 *   something, `activity` to the others; if connections are now 0, `leave` + save and
 *   `deleteAlarm()`; else the alarm rule.
 * - The alarm rule: `decideAlarm({ connections, planned: plannedAlarmAt(state, earliestExpiry(holds)),
 *   current: await getAlarm() })` → `setAlarm` / `deleteAlarm` / nothing.
 */
export class BaseRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  override async fetch(request: Request): Promise<Response> {
    void request;
    throw new Error('TODO(server): BaseRoom.fetch');
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    void ws;
    void message;
    throw new Error('TODO(server): BaseRoom.webSocketMessage');
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    void ws;
    void code;
    void reason;
    throw new Error('TODO(server): BaseRoom.webSocketClose');
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    void ws;
    throw new Error('TODO(server): BaseRoom.webSocketError');
  }

  override async alarm(): Promise<void> {
    throw new Error('TODO(server): BaseRoom.alarm');
  }
}
