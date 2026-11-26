import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { parseServerMessage, type ServerMessage } from '../../shared/protocol';

async function connect(): Promise<WebSocket> {
  const res = await exports.default.fetch('http://example.com/ws', { headers: { Upgrade: 'websocket' } });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error('no websocket in response');
  ws.accept();
  return ws;
}

function nextMessage(ws: WebSocket): Promise<ServerMessage | null> {
  return new Promise((resolve) => {
    ws.addEventListener('message', (event) => resolve(parseServerMessage(String(event.data))), { once: true });
  });
}

describe('/ws echo', () => {
  it('echoes text with an instanceId', async () => {
    const ws = await connect();
    const reply = nextMessage(ws);
    ws.send('hello');
    const msg = await reply;
    expect(msg?.data).toBe('hello');
    expect(msg?.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    ws.close();
  });

  it('keeps the same instanceId across connections to the same base', async () => {
    const a = await connect();
    const first = nextMessage(a);
    a.send('a');
    const b = await connect();
    const second = nextMessage(b);
    b.send('b');
    expect((await first)?.instanceId).toBe((await second)?.instanceId);
    a.close();
    b.close();
  });

  it('rejects non-upgrade requests', async () => {
    const res = await exports.default.fetch('http://example.com/ws');
    expect(res.status).toBe(426);
  });
});
