import { DurableObject } from 'cloudflare:workers';
import { MAX_CLIENT_MESSAGE_BYTES, type EchoMessage } from '../shared/protocol';

const INSTANCE_ID_KEY = 'instanceId';

/** The single shared base. For now it only echoes messages over hibernatable WebSockets. */
export class BaseRoom extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    if (new TextEncoder().encode(message).byteLength > MAX_CLIENT_MESSAGE_BYTES) return;
    const reply: EchoMessage = { type: 'echo', data: message, instanceId: await this.instanceId() };
    ws.send(JSON.stringify(reply));
  }

  /** Returns this object's id, creating and storing it on first use. */
  private async instanceId(): Promise<string> {
    const stored = await this.ctx.storage.get<string>(INSTANCE_ID_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    await this.ctx.storage.put(INSTANCE_ID_KEY, created);
    return created;
  }
}
