import { env, exports } from 'cloudflare:workers';
import { reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseServerMessage,
  type Fault,
  type RepairedMessage,
  type ServerMessage,
  type SnapshotMessage,
} from '../../shared/protocol';

const TIMEOUT_MS = 2000;
/** How long to wait before concluding that a message is not coming. */
const QUIET_MS = 200;

const open = new Set<Client>();

/** A test client that keeps every server message it receives. */
class Client {
  readonly messages: ServerMessage[] = [];
  closed = false;
  private readonly listeners = new Set<() => void>();

  readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = parseServerMessage(String(event.data));
      if (msg) this.messages.push(msg);
      for (const l of this.listeners) l();
    });
    ws.addEventListener('close', () => {
      this.closed = true;
    });
  }

  static async connect(): Promise<Client> {
    const res = await exports.default.fetch('http://example.com/ws', { headers: { Upgrade: 'websocket' } });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error('no websocket in response');
    ws.accept();
    const client = new Client(ws);
    open.add(client);
    return client;
  }

  /** Resolves with the first message at index >= `from` that matches, or when `match()` holds. */
  waitFor<T extends ServerMessage>(match: (m: ServerMessage) => m is T, from?: number): Promise<T>;
  waitFor(match: (m: ServerMessage) => boolean, from?: number): Promise<ServerMessage>;
  waitFor(match: (m: ServerMessage) => boolean, from = 0): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = this.messages.slice(from).find(match);
        if (!found) return;
        this.listeners.delete(check);
        clearTimeout(timer);
        resolve(found);
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`timed out; received ${JSON.stringify(this.messages.slice(from))}`));
      }, TIMEOUT_MS);
      this.listeners.add(check);
      check();
    });
  }

  /** The base as this client sees it after applying every message so far (lower versions dropped). */
  view(): { fault: Fault | null; repairs: number; version: number; presence: number } {
    const v = { fault: null as Fault | null, repairs: -1, version: -1, presence: -1 };
    for (const m of this.messages) {
      if (m.type === 'presence') {
        v.presence = m.count;
        continue;
      }
      if (m.version < v.version) continue;
      v.version = m.version;
      if (m.type === 'snapshot') {
        v.fault = m.fault;
        v.repairs = m.repairs;
        v.presence = m.presence;
      } else if (m.type === 'fault') {
        v.fault = m.fault;
      } else {
        v.fault = null;
        v.repairs = m.repairs;
      }
    }
    return v;
  }

  /** Waits until this client's view has a fault (from the snapshot or a later `fault`), and returns it. */
  async waitForFault(): Promise<Fault> {
    await this.waitFor(() => this.view().fault !== null);
    const fault = this.view().fault;
    if (!fault) throw new Error('unreachable');
    return fault;
  }

  send(value: unknown): void {
    this.ws.send(typeof value === 'string' ? value : JSON.stringify(value));
  }

  close(): void {
    if (!this.closed) this.ws.close(1000, 'bye');
    this.closed = true;
    open.delete(this);
  }
}

const isSnapshot = (m: ServerMessage): m is SnapshotMessage => m.type === 'snapshot';
const isRepaired = (m: ServerMessage): m is RepairedMessage => m.type === 'repaired';
const isFault = (m: ServerMessage) => m.type === 'fault';
const presenceIs = (n: number) => (m: ServerMessage) => m.type === 'presence' && m.count === n;
const quiet = () => new Promise((r) => setTimeout(r, QUIET_MS));

function stub() {
  return env.BASE_ROOM.getByName('base');
}

function getAlarm(): Promise<number | null> {
  return runInDurableObject(stub(), (_instance, state) => state.storage.getAlarm());
}

function deleteAlarm(): Promise<void> {
  return runInDurableObject(stub(), (_instance, state) => state.storage.deleteAlarm());
}

async function fetchBase(): Promise<SnapshotMessage> {
  const res = await exports.default.fetch('http://example.com/api/base');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/json');
  const msg = parseServerMessage(await res.text());
  if (!msg || msg.type !== 'snapshot') throw new Error('expected a snapshot');
  return msg;
}

/** Connects, waits for the first-visit fault, repairs it, and returns the client and the repair. */
async function connectAndRepair(): Promise<{ client: Client; fault: Fault; repaired: RepairedMessage }> {
  const client = await Client.connect();
  const fault = await client.waitForFault();
  client.send({ type: 'repair', faultId: fault.id });
  const repaired = await client.waitFor(isRepaired);
  return { client, fault, repaired };
}

afterEach(async () => {
  for (const c of [...open]) c.close();
  await quiet();
  await reset();
});

describe('connecting', () => {
  it('sends a snapshot first, with version, instanceId and presence', async () => {
    const a = await Client.connect();
    const snap = await a.waitFor(isSnapshot);
    expect(a.messages[0]).toBe(snap);
    expect(snap.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(snap.presence).toBe(1);
    expect(snap.repairs).toBe(0);
    expect(Number.isInteger(snap.version)).toBe(true);
  });

  it('keeps the same instanceId across connections to the same base', async () => {
    const a = await Client.connect();
    const b = await Client.connect();
    const [sa, sb] = await Promise.all([a.waitFor(isSnapshot), b.waitFor(isSnapshot)]);
    expect(sa.instanceId).toBe(sb.instanceId);
  });

  it('rejects non-upgrade requests', async () => {
    const res = await exports.default.fetch('http://example.com/ws');
    expect(res.status).toBe(426);
  });
});

describe('first visit', () => {
  it('creates a fault when the first person arrives at an empty healthy base', async () => {
    const a = await Client.connect();
    const fault = await a.waitForFault();
    expect(fault.moduleId).toBe('generator');
  });

  it('does not create a fault while a re-fault is scheduled', async () => {
    const { client: a } = await connectAndRepair();
    a.close();
    await quiet();
    expect(await getAlarm()).not.toBeNull();

    const b = await Client.connect();
    await b.waitFor(isSnapshot);
    await quiet();
    expect(b.view().fault).toBeNull();
  });
});

describe('repair', () => {
  it('broadcasts repaired to both sockets when one repairs', async () => {
    const a = await Client.connect();
    const fault = await a.waitForFault();
    const b = await Client.connect();
    await b.waitFor(isSnapshot);
    expect(b.view().fault?.id).toBe(fault.id);
    const before = b.view();

    a.send({ type: 'repair', faultId: fault.id });
    const [ra, rb] = await Promise.all([a.waitFor(isRepaired), b.waitFor(isRepaired)]);
    for (const r of [ra, rb]) {
      expect(r.faultId).toBe(fault.id);
      expect(r.repairs).toBe(before.repairs + 1);
      expect(r.version).toBeGreaterThan(before.version);
    }
    expect(a.view().fault).toBeNull();
    expect(b.view().fault).toBeNull();
  });

  it('counts two repairs of the same fault once', async () => {
    const a = await Client.connect();
    const fault = await a.waitForFault();
    const b = await Client.connect();
    await b.waitFor(isSnapshot);
    const before = a.view().repairs;

    a.send({ type: 'repair', faultId: fault.id });
    b.send({ type: 'repair', faultId: fault.id });
    await Promise.all([a.waitFor(isRepaired), b.waitFor(isRepaired)]);
    await quiet();

    expect(a.messages.filter(isRepaired)).toHaveLength(1);
    expect(b.messages.filter(isRepaired)).toHaveLength(1);
    expect((await fetchBase()).repairs).toBe(before + 1);
  });

  it('ignores a repair for an unknown fault id', async () => {
    const a = await Client.connect();
    await a.waitForFault();
    const before = await fetchBase();
    a.send({ type: 'repair', faultId: 'no-such-fault' });
    await quiet();
    expect(a.messages.filter(isRepaired)).toHaveLength(0);
    const after = await fetchBase();
    expect(after.repairs).toBe(before.repairs);
    expect(after.version).toBe(before.version);
  });

  it('ignores malformed and oversized messages without dropping the socket', async () => {
    const a = await Client.connect();
    const fault = await a.waitForFault();
    a.send('not json');
    a.send({ type: 'unknown' });
    a.send({ type: 'repair', faultId: fault.id, pad: 'x'.repeat(300) });
    await quiet();
    expect(a.messages.filter(isRepaired)).toHaveLength(0);
    expect(a.closed).toBe(false);

    a.send({ type: 'repair', faultId: fault.id });
    await a.waitFor(isRepaired);
  });

  it('ignores messages beyond 5 per second from one socket', async () => {
    const a = await Client.connect();
    const fault = await a.waitForFault();
    for (let i = 0; i < 5; i++) a.send({ type: 'repair', faultId: 'wrong' });
    a.send({ type: 'repair', faultId: fault.id });
    await quiet();
    expect(a.messages.filter(isRepaired)).toHaveLength(0);
    expect((await fetchBase()).fault?.id).toBe(fault.id);
  });

  it('schedules the next fault 20 to 40 seconds after a repair', async () => {
    const sentAt = Date.now();
    await connectAndRepair();
    const alarm = await getAlarm();
    if (alarm === null) throw new Error('no alarm scheduled');
    expect(alarm).toBeGreaterThanOrEqual(sentAt + 20_000 - 1000);
    expect(alarm).toBeLessThanOrEqual(Date.now() + 40_000 + 1000);
  });
});

describe('reconnecting', () => {
  it('gets a snapshot of the current state first', async () => {
    const { client: a, repaired } = await connectAndRepair();
    a.close();

    const again = await Client.connect();
    const snap = await again.waitFor(isSnapshot);
    expect(again.messages[0]).toBe(snap);
    expect(snap.fault).toBeNull();
    expect(snap.repairs).toBe(repaired.repairs);
    expect(snap.version).toBe(repaired.version);
  });
});

describe('presence', () => {
  it('tells everyone when someone joins and leaves, excluding the closing socket', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    const mark = a.messages.length;
    const b = await Client.connect();
    expect((await b.waitFor(isSnapshot)).presence).toBe(2);
    await a.waitFor(presenceIs(2), mark);

    const afterJoin = a.messages.length;
    b.close();
    await a.waitFor(presenceIs(1), afterJoin);
  });

  it('does not count a REST request as a connection', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    expect((await fetchBase()).presence).toBe(1);
  });
});

describe('alarm', () => {
  it('creates a new fault for everyone when it fires with people connected', async () => {
    const { client: a, fault: first } = await connectAndRepair();
    const mark = a.messages.length;

    expect(await runDurableObjectAlarm(stub())).toBe(true);
    const msg = await a.waitFor(isFault, mark);
    expect(msg.type === 'fault' && msg.fault.id).not.toBe(first.id);
    expect(a.view().fault).not.toBeNull();
  });

  it('is idempotent: leaves an existing fault alone', async () => {
    const a = await Client.connect();
    const fault = await a.waitForFault();
    const before = await fetchBase();
    const mark = a.messages.length;
    await runInDurableObject(stub(), (_i, state) => state.storage.setAlarm(Date.now() + 60_000));

    expect(await runDurableObjectAlarm(stub())).toBe(true);
    await quiet();
    const after = await fetchBase();
    expect(after.fault?.id).toBe(fault.id);
    expect(after.version).toBe(before.version);
    expect(a.messages.slice(mark).filter(isFault)).toHaveLength(0);
  });

  it('does nothing and does not reschedule when nobody is connected', async () => {
    const { client: a } = await connectAndRepair();
    a.close();
    await quiet();

    expect(await runDurableObjectAlarm(stub())).toBe(true);
    const after = await fetchBase();
    expect(after.fault).toBeNull();
    expect(after.presence).toBe(0);
    expect(await getAlarm()).toBeNull();
  });
});

describe('self-heal', () => {
  it('reschedules on connect when people are here but nothing is broken or scheduled', async () => {
    await connectAndRepair();
    await deleteAlarm();

    const b = await Client.connect();
    await b.waitFor(isSnapshot);
    await quiet();
    expect(await getAlarm()).not.toBeNull();
    expect(b.view().fault).toBeNull();
  });

  it('reschedules on a client message when nothing is broken or scheduled', async () => {
    const { client: a, fault } = await connectAndRepair();
    await deleteAlarm();

    a.send({ type: 'repair', faultId: fault.id });
    await quiet();
    expect(await getAlarm()).not.toBeNull();
  });
});

describe('GET /api/base', () => {
  it('returns the current snapshot as JSON', async () => {
    const a = await Client.connect();
    const fault = await a.waitForFault();
    const snap = await fetchBase();
    expect(snap.fault?.id).toBe(fault.id);
    expect(snap.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(snap.version).toBe(a.view().version);
  });

  it('works before anyone has connected', async () => {
    const snap = await fetchBase();
    expect(snap.presence).toBe(0);
    expect(snap.repairs).toBe(0);
    expect(snap.fault).toBeNull();
  });
});
