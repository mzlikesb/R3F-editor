import { describe, expect, it } from 'vitest';
import type { FaultMessage, RepairedMessage, ServerMessage, SnapshotMessage } from '../shared/protocol';
import {
  applyRestSnapshot,
  applyServerMessage,
  canRepair,
  initialSync,
  markIncompatible,
  serverNow,
  type SyncState,
} from './sync';

const T = 1_800_000_000_000;
const oxy = { id: 'f1', moduleId: 'oxygen', createdAt: T - 9000 } as const;
const gen = { id: 'g1', moduleId: 'generator', createdAt: T - 8000 } as const;
const comms = { id: 'c1', moduleId: 'comms', createdAt: T - 7000 } as const;

function snapshot(overrides: Partial<SnapshotMessage> = {}): SnapshotMessage {
  return {
    type: 'snapshot',
    protocol: 2,
    version: 5,
    faults: [oxy],
    repairs: 2,
    uptimeStartedAt: T - 60_000,
    longestUptimeMs: 1000,
    blackout: null,
    blackouts: [],
    lastRepair: null,
    presence: 2,
    instanceId: 'inst',
    serverNow: T,
    ...overrides,
  };
}

function faultMsg(overrides: Partial<FaultMessage> = {}): FaultMessage {
  return { type: 'fault', version: 6, fault: comms, blackoutStart: null, ...overrides };
}

function repaired(overrides: Partial<RepairedMessage> = {}): RepairedMessage {
  return {
    type: 'repaired',
    version: 6,
    faultId: 'f1',
    moduleId: 'oxygen',
    repairs: 3,
    mine: false,
    helped: false,
    helpers: 0,
    at: T + 100,
    blackoutEnd: null,
    ...overrides,
  };
}

function run(msgs: ServerMessage[], start: SyncState = initialSync, dateNow = T): SyncState {
  return msgs.reduce((s, m) => applyServerMessage(s, m, dateNow), start);
}

describe('snapshot', () => {
  it('fills the base and the clock offset', () => {
    const s = applyServerMessage(initialSync, snapshot(), T - 2500);
    expect(s.base).toEqual({
      faults: [oxy],
      repairs: 2,
      version: 5,
      instanceId: 'inst',
      uptimeStartedAt: T - 60_000,
      longestUptimeMs: 1000,
      blackout: null,
      blackouts: [],
      lastRepair: null,
    });
    expect(s.presence).toBe(2);
    expect(s.wsSynced).toBe(true);
    expect(s.clockOffsetMs).toBe(2500);
    expect(serverNow(s, T)).toBe(T + 2500);
  });

  it('keeps who-repaired unknown for a last repair from the snapshot', () => {
    const s = run([snapshot({ lastRepair: { moduleId: 'comms', at: T - 5000 } })]);
    expect(s.base?.lastRepair).toEqual({ moduleId: 'comms', at: T - 5000, mine: null, helpers: 0 });
  });

  it('drops a snapshot with a lower version from the same base', () => {
    const s = run([snapshot({ version: 10 }), snapshot({ version: 9, faults: [] })]);
    expect(s.base?.version).toBe(10);
    expect(s.base?.faults).toEqual([oxy]);
  });

  it('#15-1: takes a snapshot from another base (instanceId changed) whatever its version', () => {
    const s = run([snapshot({ version: 10 }), snapshot({ version: 2, instanceId: 'other', faults: [] })]);
    expect(s.base?.instanceId).toBe('other');
    expect(s.base?.version).toBe(2);
    expect(s.base?.faults).toEqual([]);
  });

  it('clears activity (a new connection)', () => {
    const s = run([snapshot(), { type: 'activity', holds: { f1: 2 } }, snapshot({ version: 7 })]);
    expect(s.activity).toEqual({});
  });
});

describe('fault', () => {
  it('adds the fault and bumps the version', () => {
    const s = run([snapshot(), faultMsg()]);
    expect(s.base?.faults).toEqual([oxy, comms]);
    expect(s.base?.version).toBe(6);
  });

  it('ignores a stale fault and one before any base', () => {
    const before = run([snapshot({ version: 10 })]);
    expect(applyServerMessage(before, faultMsg({ version: 9 }), T)).toBe(before);
    expect(applyServerMessage(initialSync, faultMsg(), T)).toBe(initialSync);
  });

  it('does not duplicate a fault it already has', () => {
    const s = run([snapshot({ faults: [oxy, comms] }), faultMsg()]);
    expect(s.base?.faults).toEqual([oxy, comms]);
  });

  it('(e) a blackout-starting fault cuts the uptime, updates the longest record and the history', () => {
    const record = { id: 'b9', startedAt: T + 50, endedAt: null };
    const old = Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`,
      startedAt: T - (i + 1) * 1000,
      endedAt: T - i * 1000,
    }));
    const s = run([
      snapshot({ faults: [oxy, comms], blackouts: old }),
      faultMsg({
        fault: gen,
        blackoutStart: {
          blackout: { id: 'b9', startedAt: T + 50 },
          uptimeStartedAt: null,
          longestUptimeMs: 60_050,
          record,
        },
      }),
    ]);
    expect(s.base?.blackout).toEqual({ id: 'b9', startedAt: T + 50 });
    expect(s.base?.uptimeStartedAt).toBeNull();
    expect(s.base?.longestUptimeMs).toBe(60_050);
    expect(s.base?.blackouts).toHaveLength(5);
    expect(s.base?.blackouts[0]).toEqual(record);
    expect(s.base?.blackouts[1]).toEqual(old[0]);
  });
});

describe('repaired', () => {
  it('removes only that fault and remembers the repair with mine', () => {
    const s = run([snapshot({ faults: [oxy, comms] }), repaired({ mine: true })]);
    expect(s.base?.faults).toEqual([comms]);
    expect(s.base?.repairs).toBe(3);
    expect(s.base?.lastRepair).toEqual({ moduleId: 'oxygen', at: T + 100, mine: true, helpers: 0 });
  });

  it('remembers how many helped (#56)', () => {
    const s = run([snapshot(), repaired({ helped: true, helpers: 2 })]);
    expect(s.base?.lastRepair).toEqual({ moduleId: 'oxygen', at: T + 100, mine: false, helpers: 2 });
  });

  it('ignores a stale repaired', () => {
    const before = run([snapshot({ version: 10 })]);
    expect(applyServerMessage(before, repaired({ version: 9 }), T)).toBe(before);
  });

  it('a blackout-ending repair restarts the uptime from the server value and closes the record', () => {
    const dark = snapshot({
      faults: [oxy, comms, gen],
      uptimeStartedAt: null,
      blackout: { id: 'b9', startedAt: T - 5000 },
      blackouts: [
        { id: 'b9', startedAt: T - 5000, endedAt: null },
        { id: 'b8', startedAt: T - 90_000, endedAt: T - 80_000 },
      ],
    });
    const s = run([
      dark,
      repaired({
        faultId: 'g1',
        moduleId: 'generator',
        blackoutEnd: { blackoutId: 'b9', endedAt: T + 100, uptimeStartedAt: T + 100, longestUptimeMs: 7000 },
      }),
    ]);
    expect(s.base?.blackout).toBeNull();
    expect(s.base?.uptimeStartedAt).toBe(T + 100);
    expect(s.base?.longestUptimeMs).toBe(7000);
    expect(s.base?.blackouts).toEqual([
      { id: 'b9', startedAt: T - 5000, endedAt: T + 100 },
      { id: 'b8', startedAt: T - 90_000, endedAt: T - 80_000 },
    ]);
    expect(s.base?.faults).toEqual([oxy, comms]);
  });

  it('drops the repaired fault from activity', () => {
    const s = run([snapshot({ faults: [oxy, comms] }), { type: 'activity', holds: { f1: 1, c1: 2 } }, repaired()]);
    expect(s.activity).toEqual({ c1: 2 });
  });
});

describe('activity and presence', () => {
  it('replace their value, unversioned', () => {
    const s = run([snapshot(), { type: 'activity', holds: { f1: 1 } }, { type: 'presence', count: 4 }]);
    expect(s.activity).toEqual({ f1: 1 });
    expect(s.presence).toBe(4);
    expect(run([{ type: 'activity', holds: {} }], s).activity).toEqual({});
  });
});

describe('applyRestSnapshot', () => {
  it('fills the base before the socket does, with the clock offset', () => {
    const s = applyRestSnapshot(initialSync, snapshot(), T - 1000);
    expect(s.base?.faults).toEqual([oxy]);
    expect(s.clockOffsetMs).toBe(1000);
    expect(s.wsSynced).toBe(false);
  });

  it('is ignored once a WS snapshot arrived', () => {
    const ws = run([snapshot({ version: 3 })]);
    expect(applyRestSnapshot(ws, snapshot({ version: 8 }), T)).toBe(ws);
  });
});

describe('canRepair', () => {
  const synced = run([snapshot()]);

  it('needs an open socket, a WS snapshot and that fault', () => {
    expect(canRepair(synced, 'open', 'f1')).toBe(true);
    expect(canRepair(synced, 'open', 'gone')).toBe(false);
    expect(canRepair(synced, 'reconnecting', 'f1')).toBe(false);
    expect(canRepair(applyRestSnapshot(initialSync, snapshot(), T), 'open', 'f1')).toBe(false);
  });

  it('locks when the protocol is incompatible (update banner)', () => {
    const locked = markIncompatible(synced);
    expect(locked.incompatible).toBe(true);
    expect(canRepair(locked, 'open', 'f1')).toBe(false);
    expect(markIncompatible(locked)).toBe(locked);
  });
});
