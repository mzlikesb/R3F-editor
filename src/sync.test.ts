import { describe, expect, it } from 'vitest';
import type { Fault, SnapshotMessage } from '../shared/protocol';
import { applyRestSnapshot, applyServerMessage, canRepair, initialSync, type SyncState } from './sync';

const F1: Fault = { id: 'f1', moduleId: 'generator', createdAt: 1 };
const F2: Fault = { id: 'f2', moduleId: 'generator', createdAt: 2 };

function snapshot(overrides: Partial<SnapshotMessage> = {}): SnapshotMessage {
  return { type: 'snapshot', version: 5, fault: F1, repairs: 2, presence: 3, instanceId: 'inst', ...overrides };
}

function synced(overrides: Partial<SnapshotMessage> = {}): SyncState {
  return applyServerMessage(initialSync, snapshot(overrides));
}

describe('applyServerMessage', () => {
  it('applies a snapshot', () => {
    const s = synced();
    expect(s.base).toEqual({ fault: F1, repairs: 2, version: 5, instanceId: 'inst' });
    expect(s.presence).toBe(3);
    expect(s.wsSynced).toBe(true);
  });

  it('applies repaired: no fault, new total, new version', () => {
    const s = applyServerMessage(synced(), { type: 'repaired', version: 6, faultId: 'f1', repairs: 3 });
    expect(s.base?.fault).toBeNull();
    expect(s.base?.repairs).toBe(3);
    expect(s.base?.version).toBe(6);
  });

  it('applies fault', () => {
    const healthy = synced({ fault: null });
    const s = applyServerMessage(healthy, { type: 'fault', version: 6, fault: F2 });
    expect(s.base?.fault).toEqual(F2);
    expect(s.base?.version).toBe(6);
    expect(s.base?.repairs).toBe(2);
  });

  it('drops snapshot, fault and repaired with a lower version', () => {
    const s = synced({ version: 10 });
    expect(applyServerMessage(s, snapshot({ version: 9, fault: null, repairs: 0 })).base).toEqual(s.base);
    expect(applyServerMessage(s, { type: 'fault', version: 9, fault: F2 }).base).toEqual(s.base);
    expect(applyServerMessage(s, { type: 'repaired', version: 9, faultId: 'f1', repairs: 99 }).base).toEqual(s.base);
  });

  it('applies messages in version order even when they arrive out of order', () => {
    let s = synced({ version: 5, fault: F1, repairs: 2 });
    s = applyServerMessage(s, { type: 'fault', version: 7, fault: F2 });
    s = applyServerMessage(s, { type: 'repaired', version: 6, faultId: 'f1', repairs: 3 });
    expect(s.base?.fault).toEqual(F2);
    expect(s.base?.version).toBe(7);
  });

  it('accepts a newer snapshot after reconnecting', () => {
    const s = applyServerMessage(synced({ version: 5 }), snapshot({ version: 8, fault: null, repairs: 4 }));
    expect(s.base).toEqual({ fault: null, repairs: 4, version: 8, instanceId: 'inst' });
  });

  it('always takes the latest presence, whatever the version', () => {
    let s = synced({ version: 10, presence: 3 });
    s = applyServerMessage(s, { type: 'presence', count: 1 });
    expect(s.presence).toBe(1);
    s = applyServerMessage(s, { type: 'presence', count: 4 });
    expect(s.presence).toBe(4);
    expect(s.base?.version).toBe(10);
  });

  it('does not mutate its input', () => {
    const s = synced();
    const copy = structuredClone(s);
    applyServerMessage(s, { type: 'repaired', version: 6, faultId: 'f1', repairs: 3 });
    applyServerMessage(s, { type: 'presence', count: 9 });
    expect(s).toEqual(copy);
  });
});

describe('applyRestSnapshot', () => {
  it('fills the first screen before the socket connects', () => {
    const s = applyRestSnapshot(initialSync, snapshot());
    expect(s.base).toEqual({ fault: F1, repairs: 2, version: 5, instanceId: 'inst' });
    expect(s.presence).toBe(3);
    expect(s.wsSynced).toBe(false);
  });

  it('is ignored once a WS snapshot arrived, even with a higher version', () => {
    const s = synced({ version: 5 });
    const after = applyRestSnapshot(s, snapshot({ version: 9, fault: null, repairs: 7, presence: 1 }));
    expect(after.base).toEqual(s.base);
    expect(after.presence).toBe(s.presence);
  });

  it('lets a WS snapshot replace REST data', () => {
    const rest = applyRestSnapshot(initialSync, snapshot({ version: 5 }));
    const s = applyServerMessage(rest, snapshot({ version: 6, fault: null }));
    expect(s.base?.fault).toBeNull();
    expect(s.wsSynced).toBe(true);
  });
});

describe('canRepair', () => {
  it('is enabled only when open, WS-synced, and broken', () => {
    expect(canRepair(synced(), 'open')).toBe(true);
  });

  it('is locked while connecting or reconnecting', () => {
    expect(canRepair(synced(), 'connecting')).toBe(false);
    expect(canRepair(synced(), 'reconnecting')).toBe(false);
  });

  it('is locked with only REST data', () => {
    expect(canRepair(applyRestSnapshot(initialSync, snapshot()), 'open')).toBe(false);
  });

  it('is locked when there is no fault or no base', () => {
    expect(canRepair(synced({ fault: null }), 'open')).toBe(false);
    expect(canRepair(initialSync, 'open')).toBe(false);
  });
});
