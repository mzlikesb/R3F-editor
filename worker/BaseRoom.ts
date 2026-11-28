import { DurableObject } from 'cloudflare:workers';
import {
  PING,
  PONG,
  parseClientMessage,
  socketProtocol,
  type ActivityMessage,
  type FaultMessage,
  type PartsMessage,
  type PresenceMessage,
  type RepairRejectedMessage,
  type RepairedMessage,
  type ServerMessage,
} from '../shared/protocol';
import { broadcastEach } from './broadcast';
import { activityFor, earliestExpiry, helps, isExpired, releaseHold, startHold, type Hold } from './holds';
import { legacyUpdate, toLegacyRepaired, toLegacySnapshot } from './legacy';
import { admit, createRateLimiter } from './rateLimit';
import { isMine, newAttachment, readAttachment, type SocketInfo } from './socketId';
import {
  arrive,
  collect,
  decideAlarm,
  decideOnAlarm,
  initialState,
  injectFault,
  leave,
  migrateLegacy,
  plannedAlarmAt,
  repair,
  toHistory,
  toSnapshot,
  withPartDefaults,
  type BaseState,
  type LegacyState,
  type Rng,
} from './state';

/** Storage key of the whole `BaseState` from plan 006 on (one object, one put). */
export const STATE_KEY = 'base:v2';
/** Plans 003-005 stored `LegacyState` here. Read once to migrate; never written or deleted (rollback). */
export const LEGACY_STATE_KEY = 'base';
/** Key written by plan 002; the `instanceId` of a base that never had `base`. Read only. */
export const INSTANCE_ID_KEY = 'instanceId';
/**
 * Whether a repair takes a part from the store (plan 009 A.9). A code constant, not an env value:
 * 009-2 turns it on in the same commit as `PROTOCOL_VERSION = 3`, so a deploy or a rollback always
 * moves both together. Off, pieces are still collected and the store still fills.
 */
export const PARTS_REQUIRED: boolean = false;

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
 *   `repair`: `repair()`; on success save, `repaired` to protocol-2 sockets (`mine` per socket,
 *   `helped` on the other sockets whose hold on it had not expired, `helpers` = how many; #56),
 *   `legacyUpdate` to protocol-1 sockets, `releaseHold` of that fault on every socket and an
 *   `activity` to protocol-2 sockets if any hold was cleared.
 *   With `PARTS_REQUIRED` and an empty store: `repairRejected` to this socket only (protocol 2).
 *   `collect`: `collect()`; on success save and `parts` to protocol-2 sockets (`mine` per socket).
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
  /** Per-socket rate limiters. Lost on hibernation, which only gives the socket a fresh budget. */
  private readonly limiters = new WeakMap<WebSocket, (now: number) => boolean>();
  private readonly rng: Rng = { rand: Math.random, newId: () => crypto.randomUUID() };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      if (request.method === 'GET') {
        const path = new URL(request.url).pathname;
        if (path === '/api/base') {
          const { state } = await this.loadState();
          return Response.json(toSnapshot(state, this.ctx.getWebSockets().length, Date.now()));
        }
        if (path === '/api/history') {
          const { state } = await this.loadState();
          return Response.json(toHistory(state, Date.now()));
        }
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(newAttachment(() => crypto.randomUUID(), socketProtocol(new URL(request.url))));

    const now = Date.now();
    let { state, stored } = await this.loadState();
    const peers = this.peers();
    if (peers.size === 1) {
      state = arrive(state, now, this.rng).state;
      stored = false;
    }
    if (!stored) await this.save(state);

    const info = peers.get(server)!;
    server.send(
      JSON.stringify(info.protocol === 2 ? toSnapshot(state, peers.size, now) : toLegacySnapshot(state, peers.size)),
    );
    if (info.protocol === 2) {
      const holds = activityFor(this.holdsOf(peers), info.hold);
      if (Object.keys(holds).length > 0)
        server.send(JSON.stringify({ type: 'activity', holds } satisfies ActivityMessage));
    }
    const others = new Map([...peers].filter(([ws]) => ws !== server));
    this.sendAll(others, () => presence(peers.size));
    await this.applyAlarmRule(state, peers);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMessage(message);
    if (!msg) return;
    let allow = this.limiters.get(ws);
    if (!allow) {
      allow = createRateLimiter();
      this.limiters.set(ws, allow);
    }
    const now = Date.now();
    if (!admit(msg.type, allow, now)) return;

    let { state } = await this.loadState();
    const peers = this.peers();
    const me = peers.get(ws);
    if (!me) return;

    if (msg.type === 'collect') {
      const next = collect(state, msg.slot, now);
      if (next) {
        state = next;
        await this.save(state);
        this.sendAll(peers, (info) =>
          info.protocol === 2
            ? ({
                type: 'parts',
                version: state.version,
                count: state.parts,
                slot: msg.slot,
                mine: isMine(me.id, info.id),
                serverNow: now,
              } satisfies PartsMessage)
            : null,
        );
      }
    } else if (msg.type === 'repair') {
      const result = repair(state, msg.faultId, now, this.rng, { partsRequired: PARTS_REQUIRED });
      if (result === 'noParts') {
        const rejected: RepairRejectedMessage = { type: 'repairRejected', faultId: msg.faultId, reason: 'noParts' };
        if (me.protocol === 2) broadcastEach([ws], () => JSON.stringify(rejected));
      } else if (result) {
        const before = state;
        state = result.state;
        await this.save(state);
        const generatorRepaired = legacyUpdate(before, state, result.fault);
        // Read before the holds on this fault are released below.
        const helped = new Set([...peers.values()].filter((info) => info !== me && helps(info, msg.faultId, now)));
        this.sendAll(peers, (info) => {
          if (info.protocol === 2) {
            return {
              type: 'repaired',
              version: state.version,
              faultId: msg.faultId,
              moduleId: result.fault.moduleId,
              repairs: state.repairs,
              mine: isMine(me.id, info.id),
              helped: helped.has(info),
              helpers: helped.size,
              at: now,
              blackoutEnd: result.blackoutEnd,
              parts: state.parts,
              serverNow: now,
            } satisfies RepairedMessage;
          }
          if (generatorRepaired === 'repaired') {
            return toLegacyRepaired(state, msg.faultId, isMine(me.id, info.id));
          }
          return generatorRepaired === 'snapshot' ? toLegacySnapshot(state, peers.size) : null;
        });
        let cleared = false;
        for (const [socket, info] of peers) {
          const next = releaseHold(info.hold, msg.faultId);
          if (next !== info.hold) {
            this.setHold(socket, info, next);
            cleared = true;
          }
        }
        if (cleared) this.announceActivity(peers);
      }
    } else if (msg.type === 'hold') {
      const next = startHold(me.hold, msg.faultId, now, state.faults);
      if (next !== me.hold) {
        this.setHold(ws, me, next);
        this.announceActivity(peers);
      }
    } else {
      const next = releaseHold(me.hold, msg.faultId);
      if (next !== me.hold) {
        this.setHold(ws, me, next);
        this.announceActivity(peers);
      }
    }

    await this.applyAlarmRule(state, peers);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    await this.handleGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleGone(ws);
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    let { state } = await this.loadState();
    const peers = this.peers();

    let expired = false;
    for (const [socket, info] of peers) {
      if (info.hold !== null && isExpired(info.hold, now)) {
        this.setHold(socket, info, null);
        expired = true;
      }
    }
    if (expired) this.announceActivity(peers);

    if (decideOnAlarm(state, peers.size, now) === 'injectFault') {
      const result = injectFault(state, now, this.rng);
      if (result) {
        const before = state;
        state = result.state;
        await this.save(state);
        const update = legacyUpdate(before, state, null);
        this.sendAll(peers, (info) => {
          if (info.protocol === 2) {
            return {
              type: 'fault',
              version: state.version,
              fault: result.fault,
              blackoutStart: result.blackoutStart,
            } satisfies FaultMessage;
          }
          return update === 'snapshot' ? toLegacySnapshot(state, peers.size) : null;
        });
      }
    }

    await this.applyAlarmRule(state, peers);
  }

  /** A socket closed or errored: tell the others, drop its hold, and stop the alarm when it was the last one. */
  private async handleGone(gone: WebSocket): Promise<void> {
    const peers = this.peers(gone);
    let held = false;
    try {
      held = readAttachment(gone.deserializeAttachment()).hold !== null;
    } catch {
      // the attachment of a dead socket may be unreadable
    }
    this.sendAll(peers, () => presence(peers.size));
    if (held) this.announceActivity(peers);

    const { state } = await this.loadState();
    if (peers.size === 0) {
      await this.save(leave(state, Date.now()));
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.applyAlarmRule(state, peers);
  }

  /** Open sockets with what their attachments say, read fresh. `closing` may still be listed in close callbacks. */
  private peers(closing?: WebSocket): Map<WebSocket, SocketInfo> {
    const peers = new Map<WebSocket, SocketInfo>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue;
      peers.set(ws, readAttachment(ws.deserializeAttachment()));
    }
    return peers;
  }

  private holdsOf(peers: ReadonlyMap<WebSocket, SocketInfo>): (Hold | null)[] {
    return [...peers.values()].map((info) => info.hold);
  }

  /** Sends each socket the message `build` makes for it; null sends nothing. */
  private sendAll(
    peers: ReadonlyMap<WebSocket, SocketInfo>,
    build: (info: SocketInfo) => ServerMessage | LegacyOut | null,
  ): void {
    const targets = [...peers.keys()].filter((ws) => build(peers.get(ws)!) !== null);
    broadcastEach(targets, (ws) => JSON.stringify(build(peers.get(ws)!)));
  }

  /** Each protocol-2 socket gets `activity` without its own hold. */
  private announceActivity(peers: ReadonlyMap<WebSocket, SocketInfo>): void {
    const holds = this.holdsOf(peers);
    this.sendAll(peers, (info) =>
      info.protocol === 2
        ? ({ type: 'activity', holds: activityFor(holds, info.hold) } satisfies ActivityMessage)
        : null,
    );
  }

  private setHold(ws: WebSocket, info: SocketInfo, hold: Hold | null): void {
    const current = ws.deserializeAttachment();
    const base = typeof current === 'object' && current !== null ? current : {};
    ws.serializeAttachment({ ...base, id: info.id, protocol: info.protocol, hold });
    info.hold = hold;
  }

  /** The one alarm rule (also the self-heal): run after every connect, message, close and alarm. */
  private async applyAlarmRule(state: BaseState, peers: ReadonlyMap<WebSocket, SocketInfo>): Promise<void> {
    const decision = decideAlarm({
      connections: peers.size,
      planned: plannedAlarmAt(state, earliestExpiry(this.holdsOf(peers))),
      current: await this.ctx.storage.getAlarm(),
    });
    if (decision.kind === 'set') await this.ctx.storage.setAlarm(decision.at);
    else if (decision.kind === 'delete') await this.ctx.storage.deleteAlarm();
  }

  private async save(state: BaseState): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, state);
  }

  /**
   * Reads `base:v2` (one from before plan 009 gets `withPartDefaults`); when it is missing, the
   * migrated old key or a fresh base. Never writes
   * (callers save when they decide to) and never touches the old key.
   */
  private async loadState(): Promise<{ state: BaseState; stored: boolean }> {
    const stored = await this.ctx.storage.get<BaseState>(STATE_KEY);
    if (stored) return { state: withPartDefaults(stored), stored: true };
    const now = Date.now();
    const legacy = await this.ctx.storage.get<LegacyState>(LEGACY_STATE_KEY);
    if (legacy) return { state: migrateLegacy(legacy, now, this.rng), stored: false };
    const instanceId = await this.ctx.storage.get<string>(INSTANCE_ID_KEY);
    return { state: initialState(instanceId ?? crypto.randomUUID(), now, this.rng), stored: false };
  }
}

type LegacyOut = ReturnType<typeof toLegacySnapshot> | ReturnType<typeof toLegacyRepaired>;

function presence(count: number): PresenceMessage {
  return { type: 'presence', count };
}
