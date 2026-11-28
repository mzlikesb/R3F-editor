import { describe, expect, it } from 'vitest';
import { GENERATOR, type Fault } from '../shared/protocol';
import { v1InitialSync, v1ParseServerMessage, v1Replay } from '../shared/testdata/v1';
import { legacyUpdate, toLegacyRepaired, toLegacySnapshot } from './legacy';
import { injectFault, migrateLegacy, repair, type BaseState, type Rng } from './state';

/** Parts not required: repairs behave as before plan 009. */
const OFF = { partsRequired: false } as const;
const T = 1_800_000_000_000;
const rng = (): Rng => {
  let n = 0;
  return { rand: () => 0.5, newId: () => `id-${++n}` };
};
const gen: Fault = { id: 'g1', moduleId: GENERATOR, createdAt: T - 9000 };
const oxy: Fault = { id: 'o1', moduleId: 'oxygen', createdAt: T - 8000 };

function state(overrides: Partial<BaseState> = {}): BaseState {
  return {
    faults: [gen, oxy],
    repairs: 4,
    version: 12,
    instanceId: 'inst',
    uptimeStartedAt: T - 60_000,
    longestUptimeMs: 0,
    blackout: null,
    blackouts: [],
    nextFaultAt: T + 20_000,
    lastSavedAt: T - 1000,
    lastRepair: null,
    parts: 0,
    lastPartSlot: -1,
    ...overrides,
  };
}

const frame = (v: unknown) => JSON.stringify(v);

describe('toLegacySnapshot', () => {
  it('shows only the generator fault, in the shape the deployed parser accepts', () => {
    const snap = toLegacySnapshot(state(), 3);
    expect(snap).toEqual({ type: 'snapshot', version: 12, fault: gen, repairs: 4, presence: 3, instanceId: 'inst' });
    expect(v1ParseServerMessage(frame(snap))).toEqual(snap);
  });

  it('shows no fault when only other modules are broken', () => {
    const snap = toLegacySnapshot(state({ faults: [oxy] }), 1);
    expect(snap.fault).toBeNull();
    expect(v1ParseServerMessage(frame(snap))).not.toBeNull();
  });
});

describe('toLegacyRepaired', () => {
  it('is the old repaired shape, with mine', () => {
    const msg = toLegacyRepaired(state({ faults: [oxy], repairs: 5, version: 13 }), 'g1', true);
    expect(msg).toEqual({ type: 'repaired', version: 13, faultId: 'g1', repairs: 5, mine: true });
    expect(v1ParseServerMessage(frame(msg))).toEqual(msg);
  });
});

describe('legacyUpdate', () => {
  it('sends repaired only for a generator repair', () => {
    const before = state();
    const after = repair(before, 'g1', T, rng(), OFF)!.state;
    expect(legacyUpdate(before, after, gen)).toBe('repaired');
  });

  it('sends a snapshot when the count or the generator fault changed', () => {
    const before = state();
    const oxyFixed = repair(before, 'o1', T, rng(), OFF)!.state;
    expect(legacyUpdate(before, oxyFixed, oxy)).toBe('snapshot');

    // The third fault always lands on a healthy generator.
    const twoOthers = state({ faults: [oxy, { ...oxy, id: 'c1', moduleId: 'comms' }] });
    const genBroken = injectFault(twoOthers, T, rng())!.state;
    expect(legacyUpdate(twoOthers, genBroken, null)).toBe('snapshot');
  });

  it('sends nothing when only another module broke', () => {
    const before = state({ faults: [gen] });
    const after = { ...before, faults: [gen, oxy], version: before.version + 1 };
    expect(legacyUpdate(before, after, null)).toBeNull();
  });
});

describe('an old tab through the deploy (deployed parser and reducer)', () => {
  it('keeps seeing the generator fault while other modules are repaired, and can repair it', () => {
    // The old tab had seen version 90 before the deploy; the migration goes past it.
    const migrated = migrateLegacy({ fault: gen, repairs: 41, version: 90, instanceId: 'inst' }, T, rng());
    const seen = v1Replay([
      frame({ type: 'snapshot', version: 90, fault: gen, repairs: 41, presence: 1, instanceId: 'inst' }),
    ]);

    const s0 = { ...migrated, faults: [gen, oxy], version: migrated.version + 1 };
    const frames: string[] = [frame(toLegacySnapshot(s0, 2))];

    // Someone on the new build repairs the oxygen tank.
    const s1 = repair(s0, 'o1', T + 1000, rng(), OFF)!.state;
    expect(legacyUpdate(s0, s1, oxy)).toBe('snapshot');
    frames.push(frame(toLegacySnapshot(s1, 2)));
    let view = v1Replay(frames, seen);
    expect(view.base?.fault?.id).toBe('g1');
    expect(view.base?.repairs).toBe(42);

    // The old tab repairs the generator and wins.
    const s2 = repair(s1, 'g1', T + 2000, rng(), OFF)!.state;
    expect(legacyUpdate(s1, s2, gen)).toBe('repaired');
    frames.push(frame(toLegacyRepaired(s2, 'g1', true)));
    view = v1Replay(frames, seen);
    expect(view.base?.fault).toBeNull();
    expect(view.base?.repairs).toBe(43);

    // The generator breaks again.
    const g2: Fault = { id: 'g2', moduleId: GENERATOR, createdAt: T + 3000 };
    const s3: BaseState = { ...s2, faults: [...s2.faults, g2], version: s2.version + 1 };
    expect(legacyUpdate(s2, s3, null)).toBe('snapshot');
    frames.push(frame(toLegacySnapshot(s3, 2)));
    expect(v1Replay(frames, seen).base?.fault?.id).toBe('g2');
  });

  it('a fresh old tab (no prior version) syncs from the first legacy snapshot', () => {
    const s = state();
    const view = v1Replay([frame(toLegacySnapshot(s, 1))], v1InitialSync);
    expect(view.wsSynced).toBe(true);
    expect(view.base).toEqual({ fault: gen, repairs: 4, version: 12, instanceId: 'inst' });
  });
});
