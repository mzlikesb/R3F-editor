import { DurableObject } from 'cloudflare:workers';

/**
 * The single shared base (plan 003). Task S implements the repair protocol here on top of
 * `./state`, `./broadcast` and `./rateLimit`; see `docs/plans/003-tasks.md`.
 */
export class BaseRoom extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Not implemented yet (task S).
  }
}
