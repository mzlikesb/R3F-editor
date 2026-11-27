import { DurableObject } from 'cloudflare:workers';
import { PING, PONG, parseClientMessage, type ServerMessage } from '../shared/protocol';
import { broadcast, broadcastEach } from './broadcast';
import { createRateLimiter } from './rateLimit';
import { isMine, newAttachment, readSocketId } from './socketId';
import {
  countPresence,
  decideOnAlarm,
  decideOnConnect,
  ensureFault,
  initialState,
  needsSelfHeal,
  nextFaultDelayMs,
  repair,
  toSnapshot,
  type BaseState,
} from './state';

/** Storage key of the whole `BaseState` (one object, one put). */
const STATE_KEY = 'base';
/** Key written by plan 002; reused as the `instanceId` so production keeps its id. */
const INSTANCE_ID_KEY = 'instanceId';

/** The single shared base (plan 003). Rules live in `./state`; this class does the I/O. */
export class BaseRoom extends DurableObject<Env> {
  private readonly limiters = new WeakMap<WebSocket, (now: number) => boolean>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      if (request.method === 'GET' && new URL(request.url).pathname === '/api/base') {
        const state = await this.loadState();
        return Response.json(toSnapshot(state, this.ctx.getWebSockets().length));
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(newAttachment(() => crypto.randomUUID()));

    let state = await this.loadState();
    const sockets = this.ctx.getWebSockets();
    server.send(JSON.stringify(toSnapshot(state, sockets.length)));
    broadcast(
      sockets.filter((s) => s !== server),
      JSON.stringify({ type: 'presence', count: sockets.length } satisfies ServerMessage),
    );

    const facts = { connections: sockets.length, fault: state.fault, hasAlarm: await this.hasAlarm() };
    const action = decideOnConnect(facts);
    if (action === 'createFault') {
      state = ensureFault(state, Date.now(), () => crypto.randomUUID());
      await this.saveAndAnnounceFault(state);
    } else if (action === 'scheduleAlarm') {
      await this.scheduleRefault();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let allow = this.limiters.get(ws);
    if (!allow) {
      allow = createRateLimiter();
      this.limiters.set(ws, allow);
    }
    if (!allow(Date.now())) return;

    const msg = parseClientMessage(message);
    if (!msg) return;

    const before = await this.loadState();
    const after = repair(before, msg.faultId);
    if (after !== before) {
      await this.ctx.storage.put(STATE_KEY, after);
      const requesterId = readSocketId(ws.deserializeAttachment());
      broadcastEach(this.ctx.getWebSockets(), (socket) =>
        JSON.stringify({
          type: 'repaired',
          version: after.version,
          faultId: msg.faultId,
          repairs: after.repairs,
          mine: isMine(requesterId, readSocketId(socket.deserializeAttachment())),
        } satisfies ServerMessage),
      );
    }

    const facts = {
      connections: this.ctx.getWebSockets().length,
      fault: after.fault,
      hasAlarm: await this.hasAlarm(),
    };
    if (needsSelfHeal(facts)) await this.scheduleRefault();
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    this.announcePresence(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.announcePresence(ws);
  }

  override async alarm(): Promise<void> {
    const state = await this.loadState();
    const action = decideOnAlarm({ connections: this.ctx.getWebSockets().length, fault: state.fault });
    if (action !== 'createFault') return;
    await this.saveAndAnnounceFault(ensureFault(state, Date.now(), () => crypto.randomUUID()));
  }

  private announcePresence(closing: WebSocket): void {
    const count = countPresence(this.ctx.getWebSockets(), closing);
    broadcast(
      this.ctx.getWebSockets().filter((s) => s !== closing),
      JSON.stringify({ type: 'presence', count } satisfies ServerMessage),
    );
  }

  private async saveAndAnnounceFault(state: BaseState): Promise<void> {
    if (!state.fault) return;
    await this.ctx.storage.put(STATE_KEY, state);
    broadcast(
      this.ctx.getWebSockets(),
      JSON.stringify({ type: 'fault', version: state.version, fault: state.fault } satisfies ServerMessage),
    );
  }

  private async hasAlarm(): Promise<boolean> {
    return (await this.ctx.storage.getAlarm()) !== null;
  }

  private async scheduleRefault(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + nextFaultDelayMs(Math.random));
  }

  private async loadState(): Promise<BaseState> {
    const stored = await this.ctx.storage.get<BaseState>(STATE_KEY);
    if (stored) return stored;
    const legacyId = await this.ctx.storage.get<string>(INSTANCE_ID_KEY);
    const state = initialState(legacyId ?? crypto.randomUUID());
    await this.ctx.storage.put(STATE_KEY, state);
    return state;
  }
}
