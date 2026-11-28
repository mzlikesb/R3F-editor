import { env, exports } from 'cloudflare:workers';
import { reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERATOR,
  parseServerMessage,
  type ActivityMessage,
  type Fault,
  type FaultMessage,
  type HistoryResponse,
  type PartsMessage,
  type RepairRejectedMessage,
  type RepairedMessage,
  type ServerMessage,
  type SnapshotMessage,
} from '../../shared/protocol';
import { PARTS_CAP, partSlot } from '../../shared/parts';
import { PRE009_STORED } from '../../shared/testdata/pre009';
import { v1ParseServerMessage, v1Replay, type V1ServerMessage } from '../../shared/testdata/v1';
import { LEGACY_STATE_KEY, PARTS_REQUIRED, STATE_KEY } from '../BaseRoom';
import { FIRST_FAULT_WAIT_MS, MIN_UNATTENDED_MS, type BaseState, type LegacyState } from '../state';

const TIMEOUT_MS = 2000;
/** How long to wait before concluding that a message is not coming. */
const QUIET_MS = 200;

const open = new Set<Client | LegacyClient>();

/** A protocol-2 test client (`/ws?protocol=2`) that keeps every server message it receives. */
class Client {
  readonly messages: ServerMessage[] = [];
  /** Frames the protocol-2 parser rejected. A correct server sends none. */
  readonly rejected: string[] = [];
  closed = false;
  private readonly listeners = new Set<() => void>();

  readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const raw = String(event.data);
      const msg = parseServerMessage(raw);
      if (msg) this.messages.push(msg);
      else this.rejected.push(raw);
      for (const l of this.listeners) l();
    });
    ws.addEventListener('close', () => {
      this.closed = true;
    });
  }

  static async connect(path = '/ws?protocol=2'): Promise<Client> {
    const client = new Client(await upgrade(path));
    open.add(client);
    return client;
  }

  waitFor<T extends ServerMessage>(match: (m: ServerMessage) => m is T, from?: number): Promise<T>;
  waitFor(match: (m: ServerMessage) => boolean, from?: number): Promise<ServerMessage>;
  waitFor(match: (m: ServerMessage) => boolean, from = 0): Promise<ServerMessage> {
    return waitIn(
      this.listeners,
      () => this.messages.slice(from).find(match),
      () => this.messages.slice(from),
    );
  }

  /** Current faults as this client sees them (snapshot, then fault/repaired; lower versions dropped). */
  faults(): Fault[] {
    let faults: Fault[] = [];
    let version = -1;
    for (const m of this.messages) {
      if (m.type === 'presence' || m.type === 'activity' || m.type === 'repairRejected') continue;
      if (m.version < version) continue;
      version = m.version;
      if (m.type === 'snapshot') faults = m.faults;
      else if (m.type === 'fault') faults = [...faults.filter((f) => f.id !== m.fault.id), m.fault];
      else if (m.type === 'repaired') faults = faults.filter((f) => f.id !== m.faultId);
    }
    return faults;
  }

  /** The latest activity this client received, or null. */
  activity(): Record<string, number> | null {
    const last = this.messages.filter(isActivity).at(-1);
    return last ? last.holds : null;
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

/** A tab opened before the deploy: connects to `/ws` without a query and parses with the deployed parser. */
class LegacyClient {
  readonly frames: string[] = [];
  closed = false;
  private readonly listeners = new Set<() => void>();

  readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      this.frames.push(String(event.data));
      for (const l of this.listeners) l();
    });
    ws.addEventListener('close', () => {
      this.closed = true;
    });
  }

  static async connect(): Promise<LegacyClient> {
    const client = new LegacyClient(await upgrade('/ws'));
    open.add(client);
    return client;
  }

  messages(): (V1ServerMessage | null)[] {
    return this.frames.map(v1ParseServerMessage);
  }

  view() {
    return v1Replay(this.frames);
  }

  waitFor(cond: () => boolean): Promise<unknown> {
    return waitIn(
      this.listeners,
      () => (cond() ? true : undefined),
      () => this.frames,
    );
  }

  send(value: unknown): void {
    this.ws.send(JSON.stringify(value));
  }

  close(): void {
    if (!this.closed) this.ws.close(1000, 'bye');
    this.closed = true;
    open.delete(this);
  }
}

async function upgrade(path: string): Promise<WebSocket> {
  const res = await exports.default.fetch(`http://example.com${path}`, { headers: { Upgrade: 'websocket' } });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error('no websocket in response');
  ws.accept();
  return ws;
}

function waitIn<T>(listeners: Set<() => void>, find: () => T | undefined, seen: () => unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = find();
      if (found === undefined) return;
      listeners.delete(check);
      clearTimeout(timer);
      resolve(found);
    };
    const timer = setTimeout(() => {
      listeners.delete(check);
      reject(new Error(`timed out; received ${JSON.stringify(seen())}`));
    }, TIMEOUT_MS);
    listeners.add(check);
    check();
  });
}

const isSnapshot = (m: ServerMessage): m is SnapshotMessage => m.type === 'snapshot';
const isRepaired = (m: ServerMessage): m is RepairedMessage => m.type === 'repaired';
const isFault = (m: ServerMessage): m is FaultMessage => m.type === 'fault';
const isActivity = (m: ServerMessage): m is ActivityMessage => m.type === 'activity';
const isParts = (m: ServerMessage): m is PartsMessage => m.type === 'parts';
const isRejected = (m: ServerMessage): m is RepairRejectedMessage => m.type === 'repairRejected';
const presenceIs = (n: number) => (m: ServerMessage) => m.type === 'presence' && m.count === n;
const quiet = () => new Promise((r) => setTimeout(r, QUIET_MS));

function stub() {
  return env.BASE_ROOM.getByName('base');
}

function getAlarm(): Promise<number | null> {
  return runInDurableObject(stub(), (_i, state) => state.storage.getAlarm());
}

function readState(): Promise<BaseState | undefined> {
  return runInDurableObject(stub(), (_i, state) => state.storage.get<BaseState>(STATE_KEY));
}

/** Merges `patch` into the stored `base:v2` (the room reads storage on every event). */
async function seed(patch: Partial<BaseState>): Promise<BaseState> {
  return runInDurableObject(stub(), async (_i, state) => {
    const current = await state.storage.get<BaseState>(STATE_KEY);
    if (!current) throw new Error('seed: no base:v2 yet (connect first)');
    const next = { ...current, ...patch, version: current.version + 1 };
    await state.storage.put(STATE_KEY, next);
    return next;
  });
}

function fault(moduleId: Fault['moduleId'], id = `seed-${moduleId}`): Fault {
  return { id, moduleId, createdAt: Date.now() - 5000 };
}

/** Makes the next fault due and runs the alarm. */
async function fireFault(): Promise<void> {
  await seed({ nextFaultAt: Date.now() - 1 });
  expect(await runDurableObjectAlarm(stub())).toBe(true);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await exports.default.fetch(`http://example.com${path}`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/json');
  return (await res.json()) as T;
}

async function fetchBase(): Promise<SnapshotMessage> {
  const res = await exports.default.fetch('http://example.com/api/base');
  const msg = parseServerMessage(await res.text());
  if (!msg || msg.type !== 'snapshot') throw new Error('expected a protocol-2 snapshot');
  return msg;
}

/**
 * Connects a first client (so `base:v2` exists and the base is occupied), then seeds `faults`.
 * That client has not seen them; clients from `fresh()` get them in their snapshot.
 */
async function withFaults(...faults: Fault[]): Promise<Client> {
  const a = await Client.connect();
  await a.waitFor(isSnapshot);
  await seed({ faults });
  return a;
}

/** A second client connected after seeding, so its snapshot carries the seeded state. */
async function fresh(): Promise<Client> {
  const c = await Client.connect();
  await c.waitFor(isSnapshot);
  return c;
}

afterEach(async () => {
  for (const c of [...open]) c.close();
  await quiet();
  await reset();
});

describe('connecting (protocol 2)', () => {
  it('sends a protocol-2 snapshot first, with the server time', async () => {
    const before = Date.now();
    const a = await Client.connect();
    const snap = await a.waitFor(isSnapshot);
    expect(a.messages[0]).toBe(snap);
    expect(snap.protocol).toBe(2);
    expect(snap.presence).toBe(1);
    expect(snap.repairs).toBe(0);
    expect(snap.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(snap.serverNow).toBeGreaterThanOrEqual(before - 1000);
    expect(snap.serverNow).toBeLessThanOrEqual(Date.now() + 1000);
    expect(a.rejected).toEqual([]);
  });

  it('a brand-new base starts healthy and schedules the first fault 5 s out', async () => {
    const before = Date.now();
    const a = await Client.connect();
    const snap = await a.waitFor(isSnapshot);
    expect(snap.faults).toEqual([]);
    await quiet();
    expect(a.messages.filter(isFault)).toEqual([]);
    const alarm = await getAlarm();
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeGreaterThanOrEqual(before + FIRST_FAULT_WAIT_MS);
    expect(alarm!).toBeLessThanOrEqual(Date.now() + FIRST_FAULT_WAIT_MS);
    expect(alarm).toBe((await readState())!.nextFaultAt);
  });

  it('keeps the same instanceId across connections', async () => {
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

describe('faults and repairs', () => {
  it('the alarm puts a fault on a module for everyone', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    const b = await Client.connect();
    await b.waitFor(isSnapshot);
    await fireFault();
    const [fa, fb] = await Promise.all([a.waitFor(isFault), b.waitFor(isFault)]);
    expect(fa.fault).toEqual(fb.fault);
    expect(fa.blackoutStart).toBeNull();
    expect((await readState())!.faults).toEqual([fa.fault]);
  });

  it('a repair removes only that fault and tells everyone, mine on the requester only', async () => {
    await withFaults(fault('oxygen'), fault('comms'));
    const a = await fresh();
    const b = await fresh();
    expect(a.faults().map((f) => f.moduleId)).toEqual(['oxygen', 'comms']);

    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    const [ra, rb] = await Promise.all([a.waitFor(isRepaired), b.waitFor(isRepaired)]);
    expect(ra).toMatchObject({ faultId: 'seed-oxygen', moduleId: 'oxygen', mine: true, blackoutEnd: null });
    expect(rb.mine).toBe(false);
    expect(b.faults().map((f) => f.moduleId)).toEqual(['comms']);
    expect((await fetchBase()).lastRepair).toEqual({ moduleId: 'oxygen', at: ra.at });
  });

  it('counts two repairs of the same fault once, with mine on exactly one socket', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    const before = (await fetchBase()).repairs;
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    b.send({ type: 'repair', faultId: 'seed-oxygen' });
    await Promise.all([a.waitFor(isRepaired), b.waitFor(isRepaired)]);
    await quiet();
    const all = [...a.messages.filter(isRepaired), ...b.messages.filter(isRepaired)];
    expect(all).toHaveLength(2);
    expect(all.filter((r) => r.mine)).toHaveLength(1);
    expect((await fetchBase()).repairs).toBe(before + 1);
  });

  it('ignores unknown, malformed and oversized messages without dropping the socket', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    a.send('not json');
    a.send({ type: 'unknown' });
    a.send({ type: 'repair', faultId: 'no-such-fault' });
    a.send({ type: 'repair', faultId: 'seed-oxygen', pad: 'x'.repeat(300) });
    await quiet();
    expect(a.messages.filter(isRepaired)).toHaveLength(0);
    expect(a.closed).toBe(false);
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    await a.waitFor(isRepaired);
  });

  it('ignores repairs beyond 5 per second from one socket', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    for (let i = 0; i < 5; i++) a.send({ type: 'repair', faultId: 'wrong' });
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    await quiet();
    expect(a.messages.filter(isRepaired)).toHaveLength(0);
  });
});

describe('blackout', () => {
  it('the third fault starts a blackout on the generator; repairing it brings the lights back, in order', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    await seed({ faults: [fault('oxygen'), fault('comms')], uptimeStartedAt: Date.now() - 3_600_000 });
    await fireFault();

    const start = await a.waitFor(isFault);
    expect(start.fault.moduleId).toBe(GENERATOR);
    // (e) everything the HUD and record panel need, in the fault message itself.
    expect(start.blackoutStart).not.toBeNull();
    expect(start.blackoutStart!.uptimeStartedAt).toBeNull();
    expect(start.blackoutStart!.longestUptimeMs).toBeGreaterThanOrEqual(3_600_000);
    expect(start.blackoutStart!.record).toEqual({ ...start.blackoutStart!.blackout, endedAt: null });

    const mark = a.messages.length;
    a.send({ type: 'repair', faultId: start.fault.id });
    const end = await a.waitFor(isRepaired, mark);
    expect(end.blackoutEnd).toMatchObject({ blackoutId: start.blackoutStart!.blackout.id, endedAt: end.at });
    expect(end.blackoutEnd!.uptimeStartedAt).toBe(end.at);
    expect(a.messages.indexOf(start)).toBeLessThan(a.messages.indexOf(end));

    // A tab opened after the recovery counts uptime from the same server time.
    const late = await fresh();
    const snap = late.messages.find(isSnapshot)!;
    expect(snap.blackout).toBeNull();
    expect(snap.uptimeStartedAt).toBe(end.blackoutEnd!.uptimeStartedAt);
    expect(snap.faults.map((f) => f.moduleId)).toEqual(['oxygen', 'comms']);
  });

  it('(c) at the cap nextFaultAt is null and no alarm is left; running the alarm twice makes one blackout', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    await seed({ faults: [fault('oxygen'), fault('comms')] });
    await fireFault();
    await a.waitFor(isFault);
    expect((await readState())!.nextFaultAt).toBeNull();
    expect(await getAlarm()).toBeNull();

    // A retried alarm changes nothing.
    await runInDurableObject(stub(), (_i, state) => state.storage.setAlarm(Date.now() + 60_000));
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    await quiet();
    const history = await fetchJson<HistoryResponse>('/api/history');
    expect(history.blackouts).toHaveLength(1);
    expect(a.messages.filter(isFault)).toHaveLength(1);
  });

  it('(c) a repair below the cap schedules the next fault again', async () => {
    await withFaults(fault('oxygen'), fault('comms'), fault(GENERATOR));
    await seed({ nextFaultAt: null });
    await runInDurableObject(stub(), (_i, state) => state.storage.deleteAlarm());
    const a = await fresh();
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    await a.waitFor(isRepaired);
    const s = (await readState())!;
    expect(s.nextFaultAt).not.toBeNull();
    expect(await getAlarm()).toBe(s.nextFaultAt);
  });
});

describe('activity: who is repairing right now', () => {
  it('(b) tells the others, never the holder itself, and clears on release', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    const markA = a.messages.length;

    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    const seenByB = await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 1);
    expect(seenByB).toBeTruthy();
    await quiet();
    // The holder never sees itself counted.
    for (const m of a.messages.slice(markA).filter(isActivity)) expect(m.holds['seed-oxygen'] ?? 0).toBe(0);

    const markB = b.messages.length;
    a.send({ type: 'release', faultId: 'seed-oxygen' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === undefined, markB);
  });

  it('counts two holders: each sees the other one', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    const c = await fresh();
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    b.send({ type: 'hold', faultId: 'seed-oxygen' });
    await c.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 2);
    await quiet();
    expect(a.activity()?.['seed-oxygen']).toBe(1);
    expect(b.activity()?.['seed-oxygen']).toBe(1);
  });

  it('ignores a hold for a fault that is not there', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    a.send({ type: 'hold', faultId: 'no-such-fault' });
    await quiet();
    expect(b.messages.filter(isActivity).some((m) => Object.keys(m.holds).length > 0)).toBe(false);
  });

  it('(b) a rate-limited hold is not recorded, but a release always goes through', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    for (let i = 0; i < 5; i++) a.send({ type: 'repair', faultId: 'wrong' });
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    await quiet();
    expect(b.messages.filter(isActivity).some((m) => m.holds['seed-oxygen'])).toBe(false);

    // A hold within budget, then a flood, then the release: the release is still handled.
    await new Promise((r) => setTimeout(r, 1100));
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 1);
    for (let i = 0; i < 5; i++) a.send({ type: 'repair', faultId: 'wrong' });
    const mark = b.messages.length;
    a.send({ type: 'release', faultId: 'seed-oxygen' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === undefined, mark);
  });

  it('a hold expires after 3 seconds through the alarm, which is planned for it (c)', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    const sentAt = Date.now();
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 1);
    const alarm = await getAlarm();
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeLessThanOrEqual(sentAt + 3000 + 500);

    // Age the hold past 3 s instead of waiting.
    await runInDurableObject(stub(), (_i, state) => {
      for (const ws of state.getWebSockets()) {
        const att = ws.deserializeAttachment() as { hold: { startedAt: number } | null } | null;
        if (att?.hold) ws.serializeAttachment({ ...att, hold: { ...att.hold, startedAt: Date.now() - 4000 } });
      }
    });
    const mark = b.messages.length;
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === undefined, mark);
    // Back to the next fault.
    const s = (await readState())!;
    expect(await getAlarm()).toBe(s.nextFaultAt);
  });

  it('(c) an early alarm for a hold at the cap does not inject, and leaves no alarm once the hold is gone', async () => {
    await withFaults(fault('oxygen'), fault('comms'), fault(GENERATOR));
    await seed({ nextFaultAt: null });
    const a = await fresh();
    const b = await fresh();
    a.send({ type: 'hold', faultId: 'seed-comms' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-comms'] === 1);
    expect(await getAlarm()).not.toBeNull();
    const mark = b.messages.length;
    a.send({ type: 'release', faultId: 'seed-comms' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-comms'] === undefined, mark);
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    await quiet();
    expect(b.messages.filter(isFault)).toHaveLength(0);
    expect(await getAlarm()).toBeNull();
  });

  it('closing the socket drops its hold', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 1);
    const mark = b.messages.length;
    a.close();
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === undefined, mark);
  });

  it('a repair clears every hold on that fault', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    const c = await fresh();
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    b.send({ type: 'hold', faultId: 'seed-oxygen' });
    await c.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 2);
    const mark = c.messages.length;
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    await c.waitFor(isRepaired, mark);
    await c.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === undefined, mark);
  });
});

/** Ages every socket's hold past `HOLD_EXPIRY_MS` without waiting (the alarm has not run yet). */
async function ageHolds(): Promise<void> {
  await runInDurableObject(stub(), (_i, state) => {
    for (const ws of state.getWebSockets()) {
      const att = ws.deserializeAttachment() as { hold: { startedAt: number } | null } | null;
      if (att?.hold) ws.serializeAttachment({ ...att, hold: { ...att.hold, startedAt: Date.now() - 4000 } });
    }
  });
}

describe('helped: who was holding when it was repaired (#56)', () => {
  it('two holders: the requester gets mine, the other helped, everyone helpers 1; repairs +1', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    const c = await fresh();
    const before = (await fetchBase()).repairs;
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    b.send({ type: 'hold', faultId: 'seed-oxygen' });
    await c.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 2);
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    const [ra, rb, rc] = await Promise.all([a.waitFor(isRepaired), b.waitFor(isRepaired), c.waitFor(isRepaired)]);
    expect(ra).toMatchObject({ mine: true, helped: false, helpers: 1 });
    expect(rb).toMatchObject({ mine: false, helped: true, helpers: 1 });
    expect(rc).toMatchObject({ mine: false, helped: false, helpers: 1 });
    expect(ra.repairs).toBe(before + 1);
    expect((await readState())!.repairs).toBe(before + 1);
  });

  it('three holders: the two others are helped, helpers 2 for everyone', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    const c = await fresh();
    const d = await fresh();
    for (const x of [a, b, c]) x.send({ type: 'hold', faultId: 'seed-oxygen' });
    await d.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 3);
    b.send({ type: 'repair', faultId: 'seed-oxygen' });
    const [ra, rb, rc, rd] = await Promise.all([a, b, c, d].map((x) => x.waitFor(isRepaired)));
    expect(rb).toMatchObject({ mine: true, helped: false, helpers: 2 });
    expect(ra).toMatchObject({ mine: false, helped: true, helpers: 2 });
    expect(rc).toMatchObject({ mine: false, helped: true, helpers: 2 });
    expect(rd).toMatchObject({ mine: false, helped: false, helpers: 2 });
  });

  it('the requester is never its own helper: holding alone gives helpers 0', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    a.send({ type: 'hold', faultId: 'seed-oxygen' });
    await b.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 1);
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    const [ra, rb] = await Promise.all([a.waitFor(isRepaired), b.waitFor(isRepaired)]);
    expect(ra).toMatchObject({ mine: true, helped: false, helpers: 0 });
    expect(rb).toMatchObject({ mine: false, helped: false, helpers: 0 });
  });

  it('a hold on another fault does not help', async () => {
    await withFaults(fault('oxygen'), fault('comms'));
    const a = await fresh();
    const b = await fresh();
    b.send({ type: 'hold', faultId: 'seed-comms' });
    await a.waitFor((m) => isActivity(m) && m.holds['seed-comms'] === 1);
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    const rb = await b.waitFor(isRepaired);
    expect(rb).toMatchObject({ helped: false, helpers: 0 });
  });

  it('an expired hold the alarm has not dropped yet does not help', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    b.send({ type: 'hold', faultId: 'seed-oxygen' });
    await a.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 1);
    await ageHolds();
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    const [ra, rb] = await Promise.all([a.waitFor(isRepaired), b.waitFor(isRepaired)]);
    expect(ra.helpers).toBe(0);
    expect(rb).toMatchObject({ helped: false, helpers: 0 });
  });

  it('a protocol-1 tab holding the fault is not sent helped and is not counted', async () => {
    await withFaults(fault(GENERATOR));
    const old = await LegacyClient.connect();
    await old.waitFor(() => old.view().base?.fault?.id === `seed-${GENERATOR}`);
    const a = await fresh();
    old.send({ type: 'hold', faultId: `seed-${GENERATOR}` });
    await quiet();
    a.send({ type: 'repair', faultId: `seed-${GENERATOR}` });
    const ra = await a.waitFor(isRepaired);
    expect(ra.helpers).toBe(0);
    await old.waitFor(() => old.messages().some((m) => m?.type === 'repaired'));
    const frame = old.frames.find((f) => f.includes('"repaired"'))!;
    expect(frame).not.toContain('helped');
    expect(frame).not.toContain('helpers');
    expect(old.messages().find((m) => m?.type === 'repaired')).toMatchObject({ mine: false });
  });

  it('helped comes before the holds are cleared, and a late repair of the same fault helps nobody again', async () => {
    await withFaults(fault('oxygen'));
    const a = await fresh();
    const b = await fresh();
    b.send({ type: 'hold', faultId: 'seed-oxygen' });
    await a.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === 1);
    const mark = b.messages.length;
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    const rb = await b.waitFor(isRepaired, mark);
    expect(rb).toMatchObject({ helped: true, helpers: 1 });
    await a.waitFor((m) => isActivity(m) && m.holds['seed-oxygen'] === undefined);
    // b's own repair lands just after: already repaired, so nothing is sent again.
    b.send({ type: 'repair', faultId: 'seed-oxygen' });
    await quiet();
    const after = b.messages.slice(mark);
    expect(after.filter(isRepaired)).toHaveLength(1);
    // The hold is released only after helped was sent.
    expect(after.indexOf(rb)).toBeLessThan(after.findIndex((m) => isActivity(m) && !m.holds['seed-oxygen']));
    expect((await readState())!.repairs).toBe(rb.repairs);
  });
});

describe('presence and leaving', () => {
  it('tells everyone when someone joins and leaves', async () => {
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

  it('(e) the last one out deletes the alarm and stamps the save time', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    expect(await getAlarm()).not.toBeNull();
    const before = Date.now();
    a.close();
    await quiet();
    expect(await getAlarm()).toBeNull();
    expect((await readState())!.lastSavedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('unattended time (0 -> 1)', () => {
  it('a long absence leaves two faults, back-dated, no blackout, uptime still running', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    a.close();
    await quiet();
    const uptimeStartedAt = Date.now() - 7_200_000;
    const lastSavedAt = Date.now() - 3_600_000;
    await seed({ faults: [], lastSavedAt, uptimeStartedAt });

    const b = await Client.connect();
    const snap = await b.waitFor(isSnapshot);
    expect(snap.faults).toHaveLength(2);
    expect(snap.blackout).toBeNull();
    expect(snap.uptimeStartedAt).toBe(uptimeStartedAt);
    for (const f of snap.faults) {
      expect(f.createdAt).toBeGreaterThan(lastSavedAt);
      expect(f.createdAt).toBeLessThan(Date.now() - 1000);
    }
  });

  it('(a) a quick refresh hands out no fault', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    a.close();
    await quiet();
    const b = await Client.connect();
    const snap = await b.waitFor(isSnapshot);
    await quiet();
    expect(snap.faults).toEqual([]);
    expect(b.faults()).toEqual([]);
  });

  it('a healthy base, arriving again: no fault on arrival, the first one due within 5 s', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    a.close();
    await quiet();
    // A next-fault time far away (a 40 s draw) is pulled in.
    await seed({ faults: [], nextFaultAt: Date.now() + 40_000 });
    const before = Date.now();
    const b = await Client.connect();
    const snap = await b.waitFor(isSnapshot);
    expect(snap.faults).toEqual([]);
    const s = (await readState())!;
    expect(s.nextFaultAt!).toBeGreaterThanOrEqual(before + FIRST_FAULT_WAIT_MS);
    expect(s.nextFaultAt!).toBeLessThanOrEqual(Date.now() + FIRST_FAULT_WAIT_MS);
    expect(await getAlarm()).toBe(s.nextFaultAt);
    // Fired early (as by a hold expiry), the alarm adds nothing; once due, the fault reaches everyone.
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    await quiet();
    expect(b.faults()).toEqual([]);
    await fireFault();
    await b.waitFor(isFault);
  });

  it('a second visitor does not pull the next fault in', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    await seed({ faults: [], nextFaultAt: Date.now() + 30_000 });
    await fresh();
    expect((await readState())!.nextFaultAt!).toBeGreaterThan(Date.now() + 20_000);
  });

  it('(a) the threshold is measured from the last save, not from the fault time', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    a.close();
    await quiet();
    await seed({ lastSavedAt: Date.now() - (MIN_UNATTENDED_MS - 5000) });
    const b = await Client.connect();
    expect((await b.waitFor(isSnapshot)).faults).toEqual([]);
  });
});

describe('storage migration', () => {
  it('starts from the old key only: keeps repairs, instanceId and the generator fault; the old key is untouched', async () => {
    const legacy: LegacyState = {
      fault: { id: 'old-gen', moduleId: GENERATOR, createdAt: Date.now() - 60_000 },
      repairs: 41,
      version: 90,
      instanceId: 'prod-inst',
    };
    await runInDurableObject(stub(), async (_i, state) => {
      await state.storage.delete(STATE_KEY);
      await state.storage.put(LEGACY_STATE_KEY, legacy);
    });

    const a = await Client.connect();
    const snap = await a.waitFor(isSnapshot);
    expect(snap.repairs).toBe(41);
    expect(snap.instanceId).toBe('prod-inst');
    expect(snap.faults).toEqual([legacy.fault]);
    expect(snap.version).toBeGreaterThan(90);
    const old = await runInDurableObject(stub(), (_i, state) => state.storage.get<LegacyState>(LEGACY_STATE_KEY));
    expect(old).toEqual(legacy);
    expect(await readState()).toBeDefined();
  });

  it('does not hand out unattended faults right after the migration', async () => {
    await runInDurableObject(stub(), async (_i, state) => {
      await state.storage.delete(STATE_KEY);
      await state.storage.put(LEGACY_STATE_KEY, { fault: null, repairs: 3, version: 5, instanceId: 'x' });
    });
    const a = await Client.connect();
    expect((await a.waitFor(isSnapshot)).faults).toEqual([]);
  });
});

describe('protocol 1 sockets (tabs from before the deploy)', () => {
  it('get an old-shape snapshot first and never an event they cannot parse', async () => {
    const old = await LegacyClient.connect();
    await old.waitFor(() => old.view().wsSynced);
    const first = old.messages()[0];
    expect(first?.type).toBe('snapshot');
    expect(JSON.parse(old.frames[0]!)).not.toHaveProperty('protocol');

    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    await fireFault();
    await a.waitFor(isFault);
    a.send({ type: 'hold', faultId: a.faults()[0]!.id });
    await quiet();
    for (const m of old.messages()) {
      expect(m).not.toBeNull();
      expect(['snapshot', 'repaired', 'presence']).toContain(m!.type);
    }
  });

  it("a repair on another module does not clear the old tab's generator fault", async () => {
    await withFaults(fault(GENERATOR), fault('oxygen'));
    const old = await LegacyClient.connect();
    await old.waitFor(() => old.view().base?.fault?.id === `seed-${GENERATOR}`);
    const a = await fresh();
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    await a.waitFor(isRepaired);
    await old.waitFor(() => old.view().base?.repairs === (a.messages.find(isRepaired)?.repairs ?? -1));
    expect(old.view().base?.fault?.id).toBe(`seed-${GENERATOR}`);
  });

  it('an old tab repairs the generator: it gets an old repaired with mine, the new tabs a protocol-2 one', async () => {
    await withFaults(fault(GENERATOR), fault('oxygen'));
    const old = await LegacyClient.connect();
    await old.waitFor(() => old.view().base?.fault?.id === `seed-${GENERATOR}`);
    const a = await fresh();
    old.send({ type: 'repair', faultId: `seed-${GENERATOR}` });

    const ra = await a.waitFor(isRepaired);
    expect(ra).toMatchObject({ moduleId: GENERATOR, mine: false });
    await old.waitFor(() => old.messages().some((m) => m?.type === 'repaired'));
    const repaired = old.messages().find((m) => m?.type === 'repaired');
    expect(repaired).toMatchObject({ faultId: `seed-${GENERATOR}`, mine: true });
    expect(old.view().base?.fault).toBeNull();
    expect(a.faults().map((f) => f.moduleId)).toEqual(['oxygen']);
  });
});

describe('the parts store (plan 009 A)', () => {
  /** The slot of the server clock now (the test and the room share the clock). */
  const slotNow = () => partSlot(Date.now());

  it('a new base starts with an empty store', async () => {
    const a = await Client.connect();
    expect(await a.waitFor(isSnapshot)).toMatchObject({ parts: 0, lastPartSlot: -1 });
    expect(await readState()).toMatchObject({ parts: 0, lastPartSlot: -1 });
  });

  it('collecting the current piece tells everyone, mine on the collector only, and saves', async () => {
    const a = await fresh();
    const b = await fresh();
    const slot = slotNow();
    const before = Date.now();
    a.send({ type: 'collect', slot });
    const [pa, pb] = await Promise.all([a.waitFor(isParts), b.waitFor(isParts)]);
    expect(pa).toMatchObject({ count: 1, slot, mine: true });
    expect(pb).toMatchObject({ count: 1, slot, mine: false });
    expect(pa.version).toBe(pb.version);
    expect(pa.serverNow).toBeGreaterThanOrEqual(before - 1000);
    expect(await readState()).toMatchObject({ parts: 1, lastPartSlot: slot, version: pa.version });
    expect(await (await fresh()).waitFor(isSnapshot)).toMatchObject({ parts: 1, lastPartSlot: slot });
  });

  it('the same piece tapped by two people at once counts once', async () => {
    const a = await fresh();
    const b = await fresh();
    const slot = slotNow();
    a.send({ type: 'collect', slot });
    b.send({ type: 'collect', slot });
    await Promise.all([a.waitFor(isParts), b.waitFor(isParts)]);
    await quiet();
    const all = [...a.messages.filter(isParts), ...b.messages.filter(isParts)];
    expect(all).toHaveLength(2);
    expect(all.filter((m) => m.mine)).toHaveLength(1);
    expect((await readState())!.parts).toBe(1);
  });

  it('ignores an old, a future or a malformed slot', async () => {
    const a = await fresh();
    const slot = slotNow();
    a.send({ type: 'collect', slot: slot - 5 });
    a.send({ type: 'collect', slot: slot + 5 });
    a.send({ type: 'collect', slot: 'now' });
    a.send({ type: 'collect' });
    await quiet();
    expect(a.messages.filter(isParts)).toEqual([]);
    expect(a.closed).toBe(false);
    expect((await readState())!.parts).toBe(0);
  });

  it('stops at the cap', async () => {
    const a = await fresh();
    await seed({ parts: PARTS_CAP, lastPartSlot: -1 });
    a.send({ type: 'collect', slot: slotNow() });
    await quiet();
    expect(a.messages.filter(isParts)).toEqual([]);
    expect((await readState())!.parts).toBe(PARTS_CAP);
  });

  it('collects during a blackout', async () => {
    const a = await withFaults(fault('oxygen'), fault('comms'), fault(GENERATOR));
    await seed({ blackout: { id: 'b1', startedAt: Date.now() - 1000 }, uptimeStartedAt: null, nextFaultAt: null });
    a.send({ type: 'collect', slot: slotNow() });
    expect(await a.waitFor(isParts)).toMatchObject({ count: 1, mine: true });
  });

  it('ignores collects beyond 5 per second from one socket', async () => {
    const a = await fresh();
    const slot = slotNow();
    for (let i = 0; i < 5; i++) a.send({ type: 'collect', slot: slot - 5 });
    a.send({ type: 'collect', slot });
    await quiet();
    expect(a.messages.filter(isParts)).toEqual([]);
  });

  it('PARTS_REQUIRED is off in 009-1: an empty store still repairs, and repaired carries the store and the time', async () => {
    expect(PARTS_REQUIRED).toBe(false);
    await withFaults(fault('oxygen'));
    await seed({ parts: 0 });
    const a = await fresh();
    const before = Date.now();
    a.send({ type: 'repair', faultId: 'seed-oxygen' });
    const r = await a.waitFor(isRepaired);
    expect(r).toMatchObject({ mine: true, parts: 0 });
    expect(r.serverNow).toBeGreaterThanOrEqual(before - 1000);
    expect(a.messages.filter(isRejected)).toEqual([]);
    expect((await readState())!.parts).toBe(0);
  });

  it('a protocol-1 tab gets no parts fields and no parts messages', async () => {
    const old = await LegacyClient.connect();
    await old.waitFor(() => old.view().wsSynced);
    const a = await fresh();
    a.send({ type: 'collect', slot: slotNow() });
    await a.waitFor(isParts);
    old.send({ type: 'collect', slot: slotNow() });
    await quiet();
    for (const raw of old.frames) {
      const m = JSON.parse(raw) as Record<string, unknown>;
      expect(m.type).not.toBe('parts');
      expect(m).not.toHaveProperty('parts');
      expect(m).not.toHaveProperty('lastPartSlot');
    }
    for (const m of old.messages()) expect(m).not.toBeNull();
  });

  it('(R3) a stored base from before 009 reads with an empty store; a pure read writes nothing', async () => {
    const old = JSON.parse(PRE009_STORED) as Record<string, unknown>;
    await runInDurableObject(stub(), (_i, state) => state.storage.put(STATE_KEY, old));
    const snap = await fetchBase();
    expect(snap).toMatchObject({ parts: 0, lastPartSlot: -1, repairs: old.repairs, version: old.version });
    expect(snap.faults).toEqual(old.faults);
    expect(await readState()).toEqual(old);
  });

  it('(R3) after the first save a stored base from before 009 has the full shape, old fields kept', async () => {
    const old = JSON.parse(PRE009_STORED) as Record<string, unknown>;
    await runInDurableObject(stub(), (_i, state) => state.storage.put(STATE_KEY, old));
    const a = await Client.connect();
    expect(await a.waitFor(isSnapshot)).toMatchObject({ parts: 0, lastPartSlot: -1, instanceId: old.instanceId });
    const saved = (await readState())!;
    expect(saved).toMatchObject({ parts: 0, lastPartSlot: -1, repairs: old.repairs, instanceId: old.instanceId });
  });
});

describe('REST: pure reads', () => {
  it('GET /api/base works before anyone connected and creates nothing', async () => {
    const snap = await fetchBase();
    expect(snap.protocol).toBe(2);
    expect(snap.presence).toBe(0);
    expect(snap.faults).toEqual([]);
    expect(await getAlarm()).toBeNull();
  });

  it('GET /api/base and /api/history do not run unattended time or the alarm', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    a.close();
    await quiet();
    await seed({ lastSavedAt: Date.now() - 3_600_000, faults: [] });
    const before = await readState();
    await fetchBase();
    await fetchJson<HistoryResponse>('/api/history');
    expect(await readState()).toEqual(before);
    expect(await getAlarm()).toBeNull();
  });

  it('GET /api/history returns uptime and the blackout records', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    const records = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, startedAt: 1000 - i, endedAt: 2000 - i }));
    await seed({ blackouts: records, longestUptimeMs: 12_345 });
    const history = await fetchJson<HistoryResponse>('/api/history');
    expect(history.blackouts).toEqual(records);
    expect(history.longestUptimeMs).toBe(12_345);
    expect(history.blackout).toBeNull();
    expect(typeof history.serverNow).toBe('number');
    // The snapshot carries only the five newest.
    expect((await fetchBase()).blackouts).toEqual(records.slice(0, 5));
  });

  it('does not count a REST request as a connection', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    expect((await fetchBase()).presence).toBe(1);
  });
});

describe('self-heal (one alarm rule)', () => {
  it('a client message re-sets a missing alarm while below the cap', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    await runInDurableObject(stub(), (_i, state) => state.storage.deleteAlarm());
    a.send({ type: 'repair', faultId: 'nothing' });
    await quiet();
    expect(await getAlarm()).toBe((await readState())!.nextFaultAt);
  });

  it('a connection moves a too-late alarm up to the planned time', async () => {
    const a = await Client.connect();
    await a.waitFor(isSnapshot);
    await runInDurableObject(stub(), (_i, state) => state.storage.setAlarm(Date.now() + 3_600_000));
    const b = await Client.connect();
    await b.waitFor(isSnapshot);
    await quiet();
    expect(await getAlarm()).toBe((await readState())!.nextFaultAt);
  });
});
