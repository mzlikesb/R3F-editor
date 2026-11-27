import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_FAULTS,
  MODULE_IDS,
  PROTOCOL_VERSION,
  isIncompatibleSnapshot,
  parseClientMessage,
  parseServerMessage,
  socketProtocol,
  type FaultMessage,
  type RepairedMessage,
  type SnapshotMessage,
} from './protocol';

const fault = { id: 'f1', moduleId: 'oxygen', createdAt: 1000 } as const;
const gen = { id: 'g1', moduleId: 'generator', createdAt: 900 } as const;

const snapshot: SnapshotMessage = {
  type: 'snapshot',
  protocol: 2,
  version: 3,
  faults: [gen, fault],
  repairs: 2,
  uptimeStartedAt: 500,
  longestUptimeMs: 60_000,
  blackout: null,
  blackouts: [{ id: 'b1', startedAt: 100, endedAt: 400 }],
  lastRepair: { moduleId: 'comms', at: 450 },
  presence: 1,
  instanceId: 'abc',
  serverNow: 2000,
};

const json = (v: unknown) => JSON.stringify(v);

describe('constants', () => {
  it('matches the plan', () => {
    expect(PROTOCOL_VERSION).toBe(2);
    expect(MAX_FAULTS).toBe(3);
    expect(MODULE_IDS).toEqual(['generator', 'oxygen', 'greenhouse', 'comms', 'habitat']);
  });
});

describe('parseServerMessage: snapshot', () => {
  it('parses a full snapshot', () => {
    expect(parseServerMessage(json(snapshot))).toEqual(snapshot);
  });

  it('parses a blackout snapshot (no uptime, a blackout in progress, no last repair)', () => {
    const dark = {
      ...snapshot,
      uptimeStartedAt: null,
      blackout: { id: 'b2', startedAt: 1500 },
      blackouts: [{ id: 'b2', startedAt: 1500, endedAt: null }],
      lastRepair: null,
    };
    expect(parseServerMessage(json(dark))).toEqual(dark);
  });

  it('drops unknown fields', () => {
    expect(parseServerMessage(json({ ...snapshot, extra: 1, faults: [{ ...gen, extra: true }, fault] }))).toEqual(
      snapshot,
    );
  });

  it('rejects a snapshot of another protocol or with broken fields', () => {
    expect(parseServerMessage(json({ ...snapshot, protocol: 1 }))).toBeNull();
    expect(parseServerMessage(json({ ...snapshot, protocol: 3 }))).toBeNull();
    const { protocol: _p, ...noProtocol } = snapshot;
    expect(parseServerMessage(json(noProtocol))).toBeNull();
    expect(parseServerMessage(json({ ...snapshot, faults: [{ ...fault, moduleId: 'kitchen' }] }))).toBeNull();
    expect(parseServerMessage(json({ ...snapshot, faults: null }))).toBeNull();
    expect(parseServerMessage(json({ ...snapshot, serverNow: '2000' }))).toBeNull();
    expect(parseServerMessage(json({ ...snapshot, blackouts: [{ id: 'b', startedAt: 1, endedAt: 'x' }] }))).toBeNull();
    expect(parseServerMessage(json({ ...snapshot, blackout: { id: '' } }))).toBeNull();
  });

  it('rejects the protocol-1 snapshot shape', () => {
    const v1 = { type: 'snapshot', version: 3, fault: gen, repairs: 2, presence: 1, instanceId: 'abc' };
    expect(parseServerMessage(json(v1))).toBeNull();
  });
});

describe('parseServerMessage: events', () => {
  it('parses a fault with and without a blackout start', () => {
    const plain: FaultMessage = { type: 'fault', version: 4, fault, blackoutStart: null };
    expect(parseServerMessage(json(plain))).toEqual(plain);
    const { blackoutStart: _b, ...missing } = plain;
    expect(parseServerMessage(json(missing))).toEqual(plain);

    const dark: FaultMessage = {
      type: 'fault',
      version: 5,
      fault: gen,
      blackoutStart: {
        blackout: { id: 'b2', startedAt: 3000 },
        uptimeStartedAt: null,
        longestUptimeMs: 90_000,
        record: { id: 'b2', startedAt: 3000, endedAt: null },
      },
    };
    expect(parseServerMessage(json(dark))).toEqual(dark);
    expect(
      parseServerMessage(json({ ...dark, blackoutStart: { ...dark.blackoutStart, uptimeStartedAt: 5 } })),
    ).toBeNull();
  });

  it('parses a repaired with and without a blackout end', () => {
    const plain: RepairedMessage = {
      type: 'repaired',
      version: 6,
      faultId: 'f1',
      moduleId: 'oxygen',
      repairs: 3,
      mine: true,
      helped: false,
      helpers: 0,
      at: 4000,
      blackoutEnd: null,
    };
    expect(parseServerMessage(json(plain))).toEqual(plain);

    const end: RepairedMessage = {
      ...plain,
      faultId: 'g1',
      moduleId: 'generator',
      blackoutEnd: { blackoutId: 'b2', endedAt: 4000, uptimeStartedAt: 4000, longestUptimeMs: 90_000 },
    };
    expect(parseServerMessage(json(end))).toEqual(end);
    expect(parseServerMessage(json({ ...end, blackoutEnd: { blackoutId: 'b2' } }))).toBeNull();
  });

  it('reads only the boolean true as mine', () => {
    const base = { type: 'repaired', version: 6, faultId: 'f1', moduleId: 'oxygen', repairs: 3, at: 4000 };
    for (const mine of [undefined, 'true', 1, null, {}]) {
      expect((parseServerMessage(json({ ...base, mine })) as RepairedMessage).mine).toBe(false);
    }
  });

  it('reads only the boolean true as helped (#56)', () => {
    const base = { type: 'repaired', version: 6, faultId: 'f1', moduleId: 'oxygen', repairs: 3, at: 4000, mine: false };
    expect((parseServerMessage(json({ ...base, helped: true })) as RepairedMessage).helped).toBe(true);
    for (const helped of [undefined, 'true', 1, null, {}]) {
      expect((parseServerMessage(json({ ...base, helped })) as RepairedMessage).helped).toBe(false);
    }
  });

  it('reads helpers as a count; missing or malformed is 0, never a rejection (#56)', () => {
    const base = { type: 'repaired', version: 6, faultId: 'f1', moduleId: 'oxygen', repairs: 3, at: 4000, mine: true };
    expect((parseServerMessage(json({ ...base, helpers: 2 })) as RepairedMessage).helpers).toBe(2);
    for (const helpers of [undefined, null, -1, 1.5, '2', {}]) {
      const msg = parseServerMessage(json({ ...base, helpers })) as RepairedMessage;
      expect(msg).not.toBeNull();
      expect(msg.helpers).toBe(0);
    }
  });

  it('parses activity, keeping counts of one or more', () => {
    expect(parseServerMessage(json({ type: 'activity', holds: { f1: 1, g1: 2 } }))).toEqual({
      type: 'activity',
      holds: { f1: 1, g1: 2 },
    });
    expect(parseServerMessage(json({ type: 'activity', holds: { f1: 0 } }))).toEqual({ type: 'activity', holds: {} });
    expect(parseServerMessage(json({ type: 'activity', holds: {} }))).toEqual({ type: 'activity', holds: {} });
    expect(parseServerMessage(json({ type: 'activity', holds: { f1: -1 } }))).toBeNull();
    expect(parseServerMessage(json({ type: 'activity', holds: { f1: '1' } }))).toBeNull();
    expect(parseServerMessage(json({ type: 'activity' }))).toBeNull();
  });

  it('parses presence', () => {
    expect(parseServerMessage(json({ type: 'presence', count: 2 }))).toEqual({ type: 'presence', count: 2 });
    expect(parseServerMessage(json({ type: 'presence', count: '2' }))).toBeNull();
  });

  it('rejects malformed or unknown input', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('null')).toBeNull();
    expect(parseServerMessage('[]')).toBeNull();
    expect(parseServerMessage('{"type":"other"}')).toBeNull();
    expect(parseServerMessage('{"type":"fault","version":4,"fault":null}')).toBeNull();
    expect(parseServerMessage(json({ type: 'repaired', version: 6, faultId: 'f1', repairs: 3, at: 1 }))).toBeNull();
  });
});

describe('isIncompatibleSnapshot', () => {
  it('is true for a snapshot this build cannot read', () => {
    expect(isIncompatibleSnapshot(json({ ...snapshot, protocol: 3 }))).toBe(true);
    expect(isIncompatibleSnapshot(json({ type: 'snapshot', version: 1, fault: null, repairs: 0 }))).toBe(true);
    expect(isIncompatibleSnapshot(json({ ...snapshot, faults: 'x' }))).toBe(true);
  });

  it('is false for a good snapshot and for anything that is not a snapshot', () => {
    expect(isIncompatibleSnapshot(json(snapshot))).toBe(false);
    expect(isIncompatibleSnapshot(json({ type: 'presence', count: 1 }))).toBe(false);
    expect(isIncompatibleSnapshot('pong')).toBe(false);
    expect(isIncompatibleSnapshot('{"type":"unknown"}')).toBe(false);
  });
});

describe('socketProtocol', () => {
  it('is 2 only for ?protocol=2', () => {
    expect(socketProtocol(new URL('https://x.dev/ws?protocol=2'))).toBe(2);
    expect(socketProtocol(new URL('https://x.dev/ws'))).toBe(1);
    expect(socketProtocol(new URL('https://x.dev/ws?protocol=1'))).toBe(1);
    expect(socketProtocol(new URL('https://x.dev/ws?protocol=abc'))).toBe(1);
  });
});

describe('parseClientMessage', () => {
  it('parses repair, hold and release, dropping extra fields', () => {
    for (const type of ['repair', 'hold', 'release'] as const) {
      expect(parseClientMessage(json({ type, faultId: 'f1', extra: 1 }))).toEqual({ type, faultId: 'f1' });
    }
  });

  it('ignores malformed, unknown, and binary messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('null')).toBeNull();
    expect(parseClientMessage('"repair"')).toBeNull();
    expect(parseClientMessage('{"type":"other","faultId":"f1"}')).toBeNull();
    expect(parseClientMessage('{"type":"repair"}')).toBeNull();
    expect(parseClientMessage('{"type":"hold","faultId":1}')).toBeNull();
    expect(parseClientMessage('{"type":"release","faultId":""}')).toBeNull();
    expect(parseClientMessage('ping')).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });

  it(`ignores messages over ${MAX_CLIENT_MESSAGE_BYTES} bytes, counting UTF-8 bytes`, () => {
    const wrap = (id: string) => `{"type":"repair","faultId":"${id}"}`;
    const overhead = wrap('').length;

    const fits = wrap('a'.repeat(MAX_CLIENT_MESSAGE_BYTES - overhead));
    expect(new TextEncoder().encode(fits).byteLength).toBe(MAX_CLIENT_MESSAGE_BYTES);
    expect(parseClientMessage(fits)).not.toBeNull();

    expect(parseClientMessage(wrap('a'.repeat(MAX_CLIENT_MESSAGE_BYTES - overhead + 1)))).toBeNull();

    const multibyte = wrap('가'.repeat(80));
    expect(multibyte.length).toBeLessThanOrEqual(MAX_CLIENT_MESSAGE_BYTES);
    expect(parseClientMessage(multibyte)).toBeNull();
  });
});
