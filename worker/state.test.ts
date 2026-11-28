import { describe, expect, it } from 'vitest';
import { GENERATOR, HISTORY_BLACKOUTS, MAX_FAULTS, MODULE_IDS, type Fault, type ModuleId } from '../shared/protocol';
import { PARTS_CAP, PART_SLOT_MS, clampParts, partSlot } from '../shared/parts';
import { PRE009_STORED } from '../shared/testdata/pre009';
import {
  FIRST_FAULT_WAIT_MS,
  MIN_UNATTENDED_MS,
  REFAULT_MAX_MS,
  REFAULT_MIN_MS,
  UNATTENDED_FAULT_CAP,
  arrive,
  collect,
  countPresence,
  decideAlarm,
  decideOnAlarm,
  initialState,
  injectFault,
  leave,
  migrateLegacy,
  nextFaultDelayMs,
  plannedAlarmAt,
  repair,
  slotOpen,
  toHistory,
  toSnapshot,
  withPartDefaults,
  type BaseState,
  type Rng,
} from './state';

/** Parts not required: repairs behave as before plan 009. */
const OFF = { partsRequired: false } as const;
const T = 1_800_000_000_000;

/** `rand` cycles through `values`; ids are `id-1`, `id-2`, ... */
function rng(values: number[] = [0.5]): Rng {
  let i = 0;
  let n = 0;
  return { rand: () => values[i++ % values.length]!, newId: () => `id-${++n}` };
}

function fault(moduleId: ModuleId, createdAt = T - 5000): Fault {
  return { id: `f-${moduleId}`, moduleId, createdAt };
}

function state(overrides: Partial<BaseState> = {}): BaseState {
  return {
    faults: [],
    repairs: 2,
    version: 7,
    instanceId: 'inst',
    uptimeStartedAt: T - 3_600_000,
    longestUptimeMs: 0,
    blackout: null,
    blackouts: [],
    nextFaultAt: T,
    lastSavedAt: T - 1000,
    lastRepair: null,
    parts: 0,
    lastPartSlot: -1,
    ...overrides,
  };
}

/** A base in a blackout: three faults, one on the generator. */
function dark(overrides: Partial<BaseState> = {}): BaseState {
  return state({
    faults: [fault('oxygen'), fault('comms'), fault(GENERATOR)],
    uptimeStartedAt: null,
    longestUptimeMs: 7_200_000,
    blackout: { id: 'b1', startedAt: T - 10_000 },
    blackouts: [{ id: 'b1', startedAt: T - 10_000, endedAt: null }],
    nextFaultAt: null,
    ...overrides,
  });
}

function expectNextFaultWithinRange(s: BaseState, now: number) {
  expect(s.nextFaultAt).not.toBeNull();
  expect(s.nextFaultAt!).toBeGreaterThanOrEqual(now + REFAULT_MIN_MS);
  expect(s.nextFaultAt!).toBeLessThanOrEqual(now + REFAULT_MAX_MS);
}

describe('constants', () => {
  it('match the plan and neon (a)', () => {
    expect(REFAULT_MIN_MS).toBe(20_000);
    expect(REFAULT_MAX_MS).toBe(40_000);
    expect(UNATTENDED_FAULT_CAP).toBe(2);
    expect(MAX_FAULTS).toBe(3);
    // The short-reconnect guard is longer than the longest fault interval, so "at least one" holds.
    expect(MIN_UNATTENDED_MS).toBeGreaterThanOrEqual(REFAULT_MAX_MS);
  });
});

describe('nextFaultDelayMs', () => {
  it('stays within 20 to 40 seconds and uses the random source', () => {
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      const delay = nextFaultDelayMs(() => r);
      expect(delay).toBeGreaterThanOrEqual(REFAULT_MIN_MS);
      expect(delay).toBeLessThanOrEqual(REFAULT_MAX_MS);
    }
    expect(nextFaultDelayMs(() => 0)).toBeLessThan(nextFaultDelayMs(() => 0.99));
  });
});

describe('initialState', () => {
  it('starts healthy, uptime from now, next fault 20-40 s out', () => {
    const s = initialState('inst', T, rng());
    expect(s).toMatchObject({
      faults: [],
      repairs: 0,
      version: 0,
      instanceId: 'inst',
      uptimeStartedAt: T,
      longestUptimeMs: 0,
      blackout: null,
      blackouts: [],
      lastSavedAt: T,
      lastRepair: null,
      parts: 0,
      lastPartSlot: -1,
    });
    expectNextFaultWithinRange(s, T);
  });
});

describe('migrateLegacy', () => {
  const legacy = {
    fault: { id: 'g-old', moduleId: GENERATOR, createdAt: T - 50_000 },
    repairs: 41,
    version: 90,
    instanceId: 'prod-inst',
  } as const;

  it('keeps repairs, instanceId and the generator fault; version goes past the old one', () => {
    const s = migrateLegacy(legacy, T, rng());
    expect(s.repairs).toBe(41);
    expect(s.instanceId).toBe('prod-inst');
    expect(s.faults).toEqual([legacy.fault]);
    expect(s.version).toBeGreaterThan(legacy.version);
  });

  it('fills the new fields with the migration-time defaults', () => {
    const s = migrateLegacy({ ...legacy, fault: null }, T, rng());
    expect(s).toMatchObject({
      faults: [],
      uptimeStartedAt: T,
      lastSavedAt: T,
      longestUptimeMs: 0,
      blackout: null,
      blackouts: [],
      lastRepair: null,
      parts: 0,
      lastPartSlot: -1,
    });
    expectNextFaultWithinRange(s, T);
  });

  it('does not change the legacy object', () => {
    const copy = structuredClone(legacy);
    migrateLegacy(legacy, T, rng());
    expect(legacy).toEqual(copy);
  });

  it('brings no burst of unattended faults right after the migration', () => {
    const s = migrateLegacy({ ...legacy, fault: null }, T, rng());
    const { state: after, injected } = arrive(s, T + 1000, rng());
    expect(injected).toEqual([]);
    expect(after.faults).toEqual([]);
  });
});

describe('injectFault', () => {
  it('adds one fault on a healthy module, with a new id, now, and a version bump', () => {
    const before = state({ faults: [fault(GENERATOR)] });
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const result = injectFault(before, T, rng([r]));
      expect(result).not.toBeNull();
      const { state: s, fault: f } = result!;
      expect(f.moduleId).not.toBe(GENERATOR);
      expect(f.createdAt).toBe(T);
      expect(f.id).toBe('id-1');
      expect(s.faults).toEqual([...before.faults, f]);
      expect(s.version).toBe(before.version + 1);
      expect(s.lastSavedAt).toBe(T);
    }
  });

  it('never puts two faults on one module', () => {
    let s = state();
    const random = rng([0, 0.99, 0.5, 0.2, 0.7]);
    for (let i = 0; i < MAX_FAULTS; i++) s = injectFault(s, T + i, random)!.state;
    const modules = s.faults.map((f) => f.moduleId);
    expect(new Set(modules).size).toBe(modules.length);
  });

  it('does nothing at the cap of three', () => {
    expect(injectFault(dark(), T, rng())).toBeNull();
  });

  it('puts the third fault on the generator when the generator is healthy', () => {
    for (const r of [0, 0.4, 0.99]) {
      const result = injectFault(state({ faults: [fault('oxygen'), fault('comms')] }), T, rng([r]));
      expect(result!.fault.moduleId).toBe(GENERATOR);
    }
  });

  it('picks any healthy module for the third fault when the generator is already broken', () => {
    const result = injectFault(state({ faults: [fault(GENERATOR), fault('comms')] }), T, rng([0.5]));
    expect([GENERATOR, 'comms']).not.toContain(result!.fault.moduleId);
  });

  it('sets the next fault 20-40 s out below the cap, and null at the cap (neon (c))', () => {
    const one = injectFault(state(), T, rng())!.state;
    expectNextFaultWithinRange(one, T);
    const three = injectFault(state({ faults: [fault('oxygen'), fault('comms')] }), T, rng())!.state;
    expect(three.faults).toHaveLength(MAX_FAULTS);
    expect(three.nextFaultAt).toBeNull();
  });
});

describe('blackout start', () => {
  const before = state({
    faults: [fault('oxygen'), fault('comms')],
    uptimeStartedAt: T - 3_600_000,
    longestUptimeMs: 1_000,
  });

  it('starts when the third fault arrives: record, history, uptime cut', () => {
    const { state: s, blackoutStart } = injectFault(before, T, rng())!;
    expect(s.blackout).toEqual({ id: expect.any(String), startedAt: T });
    expect(s.blackouts[0]).toEqual({ id: s.blackout!.id, startedAt: T, endedAt: null });
    expect(s.uptimeStartedAt).toBeNull();
    expect(s.longestUptimeMs).toBe(3_600_000);
    // (e) the `fault` message carries everything the HUD and record panel need.
    expect(blackoutStart).toEqual({
      blackout: s.blackout,
      uptimeStartedAt: null,
      longestUptimeMs: 3_600_000,
      record: { id: s.blackout!.id, startedAt: T, endedAt: null },
    });
  });

  it('keeps a longer earlier record', () => {
    const { state: s, blackoutStart } = injectFault({ ...before, longestUptimeMs: 9_000_000 }, T, rng())!;
    expect(s.longestUptimeMs).toBe(9_000_000);
    expect(blackoutStart!.longestUptimeMs).toBe(9_000_000);
  });

  it('keeps at most 20 records, newest first', () => {
    const old = Array.from({ length: HISTORY_BLACKOUTS }, (_, i) => ({
      id: `old-${i}`,
      startedAt: T - (i + 2) * 100_000,
      endedAt: T - (i + 2) * 100_000 + 50_000,
    }));
    const { state: s } = injectFault({ ...before, blackouts: old }, T, rng())!;
    expect(s.blackouts).toHaveLength(HISTORY_BLACKOUTS);
    expect(s.blackouts[0]!.startedAt).toBe(T);
    expect(s.blackouts[1]!.id).toBe('old-0');
  });

  it('does not start a second blackout when it goes 2 -> 3 again during one', () => {
    const during = dark({ faults: [fault('comms'), fault(GENERATOR)], nextFaultAt: T });
    const result = injectFault(during, T, rng())!;
    expect(result.state.faults).toHaveLength(3);
    expect(result.blackoutStart).toBeNull();
    expect(result.state.blackout).toEqual(during.blackout);
    expect(result.state.blackouts).toEqual(during.blackouts);
  });
});

describe('decideOnAlarm', () => {
  it('injects when someone is here and the next fault is due', () => {
    expect(decideOnAlarm(state({ nextFaultAt: T }), 1, T)).toBe('injectFault');
    expect(decideOnAlarm(state({ nextFaultAt: T - 5 }), 2, T)).toBe('injectFault');
  });

  it('does nothing early (an alarm for a hold expiry), at the cap, or with nobody here', () => {
    expect(decideOnAlarm(state({ nextFaultAt: T + 1 }), 1, T)).toBe('none');
    expect(decideOnAlarm(dark(), 1, T)).toBe('none');
    expect(decideOnAlarm(state({ nextFaultAt: T }), 0, T)).toBe('none');
  });

  it('is idempotent: an alarm run twice after the third fault makes one blackout', () => {
    let s = state({ faults: [fault('oxygen'), fault('comms')], nextFaultAt: T });
    for (let i = 0; i < 2; i++) {
      if (decideOnAlarm(s, 1, T) === 'injectFault') s = injectFault(s, T, rng())!.state;
    }
    expect(s.faults).toHaveLength(3);
    expect(s.blackouts).toHaveLength(1);
  });
});

describe('repair', () => {
  const two = state({ faults: [fault('oxygen'), fault('comms')], nextFaultAt: T + 5000 });

  it('removes only that fault, counts it, remembers it, and reschedules', () => {
    const { state: s, fault: f, blackoutEnd } = repair(two, 'f-oxygen', T, rng(), OFF)!;
    expect(f).toEqual(fault('oxygen'));
    expect(s.faults).toEqual([fault('comms')]);
    expect(s.repairs).toBe(3);
    expect(s.version).toBe(8);
    expect(s.lastRepair).toEqual({ moduleId: 'oxygen', at: T });
    expect(s.lastSavedAt).toBe(T);
    expect(blackoutEnd).toBeNull();
    expectNextFaultWithinRange(s, T);
  });

  it('is idempotent and ignores unknown ids', () => {
    const once = repair(two, 'f-oxygen', T, rng(), OFF)!.state;
    expect(repair(once, 'f-oxygen', T + 1, rng(), OFF)).toBeNull();
    expect(repair(two, 'nope', T, rng(), OFF)).toBeNull();
  });

  it('does not change its input', () => {
    const copy = structuredClone(two);
    repair(two, 'f-oxygen', T, rng(), OFF);
    expect(two).toEqual(copy);
  });

  it('reschedules the next fault when a repair brings the base below the cap (neon (c))', () => {
    const { state: s } = repair(dark(), 'f-oxygen', T, rng(), OFF)!;
    expect(s.faults).toHaveLength(2);
    expectNextFaultWithinRange(s, T);
  });

  it('no fault lands within 2.5 s of a repair', () => {
    const { state: s } = repair(two, 'f-comms', T, rng([0]), OFF)!;
    expect(decideOnAlarm(s, 1, T + 2500)).toBe('none');
  });
});

describe('blackout end', () => {
  it('does not end when another module is repaired', () => {
    const { state: s, blackoutEnd } = repair(dark(), 'f-comms', T, rng(), OFF)!;
    expect(s.blackout).not.toBeNull();
    expect(s.uptimeStartedAt).toBeNull();
    expect(blackoutEnd).toBeNull();
  });

  it('ends when the generator is repaired: history filled, new uptime from now, other faults stay', () => {
    const { state: s, blackoutEnd } = repair(dark(), `f-${GENERATOR}`, T, rng(), OFF)!;
    expect(s.blackout).toBeNull();
    expect(s.blackouts[0]).toEqual({ id: 'b1', startedAt: T - 10_000, endedAt: T });
    expect(s.uptimeStartedAt).toBe(T);
    expect(s.longestUptimeMs).toBe(7_200_000);
    expect(s.faults.map((f) => f.moduleId)).toEqual(['oxygen', 'comms']);
    expect(blackoutEnd).toEqual({ blackoutId: 'b1', endedAt: T, uptimeStartedAt: T, longestUptimeMs: 7_200_000 });
  });

  it('reschedules the next fault so nothing lands within 2.5 s of the recovery', () => {
    const { state: s } = repair(dark(), `f-${GENERATOR}`, T, rng([0]), OFF)!;
    expectNextFaultWithinRange(s, T);
    expect(decideOnAlarm(s, 1, T + 2500)).toBe('none');
  });

  it('a repeated generator repair does not end the blackout twice', () => {
    const once = repair(dark(), `f-${GENERATOR}`, T, rng(), OFF)!.state;
    expect(repair(once, `f-${GENERATOR}`, T + 10, rng(), OFF)).toBeNull();
    expect(once.blackouts.filter((b) => b.id === 'b1')).toHaveLength(1);
  });
});

describe('arrive (0 -> 1): unattended time', () => {
  it('(a) a short reconnect creates no fault, so refreshing cannot farm repairs', () => {
    const s = state({ lastSavedAt: T - 5000 });
    const { state: after, injected } = arrive(s, T, rng());
    expect(injected).toEqual([]);
    expect(after.faults).toEqual([]);
    expect(after.version).toBe(s.version);

    // Refresh ten times in a row: still nothing.
    let cur = after;
    for (let i = 1; i <= 10; i++) {
      cur = leave(cur, T + i * 2000);
      cur = arrive(cur, T + i * 2000 + 800, rng()).state;
    }
    expect(cur.faults).toEqual([]);
  });

  it('(a) just under the threshold is still nothing; at the threshold there is at least one fault', () => {
    expect(arrive(state({ lastSavedAt: T - (MIN_UNATTENDED_MS - 1) }), T, rng()).injected).toEqual([]);
    expect(arrive(state({ lastSavedAt: T - MIN_UNATTENDED_MS }), T, rng([0.99])).injected.length).toBeGreaterThan(0);
  });

  it('counts faults by elapsed time at 20-40 s steps', () => {
    // rand 0.99 → 40 s steps: 60 s away is one fault.
    expect(arrive(state({ lastSavedAt: T - 60_000 }), T, rng([0.99])).injected).toHaveLength(1);
    // rand 0 → 20 s steps: 60 s away would be three, capped at two.
    expect(arrive(state({ lastSavedAt: T - 60_000 }), T, rng([0])).injected).toHaveLength(2);
  });

  it('back-dates each fault to when it would have broken, never before the last save', () => {
    const lastSavedAt = T - 10 * 60_000;
    const { injected } = arrive(state({ lastSavedAt }), T, rng([0]));
    expect(injected.map((f) => f.createdAt)).toEqual([lastSavedAt + 20_000, lastSavedAt + 40_000]);
    for (const f of injected) {
      expect(f.createdAt).toBeGreaterThan(lastSavedAt);
      expect(f.createdAt).toBeLessThanOrEqual(T);
    }
  });

  it('stops at two faults in total, counting the ones already there, and never blacks out', () => {
    const long = T - 3_600_000;
    expect(arrive(state({ lastSavedAt: long }), T, rng()).state.faults).toHaveLength(2);
    expect(arrive(state({ lastSavedAt: long, faults: [fault('oxygen')] }), T, rng()).injected).toHaveLength(1);
    const twoAlready = arrive(state({ lastSavedAt: long, faults: [fault('oxygen'), fault('comms')] }), T, rng());
    expect(twoAlready.injected).toEqual([]);
    for (const r of [0, 0.5, 0.99]) {
      const { state: s } = arrive(state({ lastSavedAt: long }), T, rng([r]));
      expect(s.blackout).toBeNull();
      expect(s.blackouts).toEqual([]);
    }
  });

  it('keeps the uptime record running', () => {
    const s = state({ lastSavedAt: T - 3_600_000, uptimeStartedAt: T - 7_200_000 });
    expect(arrive(s, T, rng()).state.uptimeStartedAt).toBe(T - 7_200_000);
  });

  it('a blackout left behind stays as it was', () => {
    const before = dark({ lastSavedAt: T - 3_600_000 });
    const { state: s, injected } = arrive(before, T, rng());
    expect(injected).toEqual([]);
    expect(s.faults).toEqual(before.faults);
    expect(s.blackout).toEqual(before.blackout);
    expect(s.nextFaultAt).toBeNull();
  });

  it('reschedules the next fault from now, so nothing lands within 2.5 s of arriving', () => {
    for (const lastSavedAt of [T - 1000, T - 3_600_000]) {
      // A next-fault time left in the past while nobody was here must not fire on arrival.
      const { state: s } = arrive(state({ lastSavedAt, nextFaultAt: T - 100_000 }), T, rng([0]));
      expect(s.nextFaultAt).not.toBeNull();
      expect(s.nextFaultAt!).toBeGreaterThanOrEqual(T + FIRST_FAULT_WAIT_MS);
      expect(s.nextFaultAt!).toBeLessThanOrEqual(T + REFAULT_MAX_MS);
      expect(decideOnAlarm(s, 1, T + 2500)).toBe('none');
    }
  });

  it('a healthy base pulls the first fault in to 5 s, so nobody waits 20-40 s for something to do', () => {
    // Playtest #47: arriving to a base with nothing broken, all three left before the first fault.
    for (const lastSavedAt of [T - 1000, T - 30_000]) {
      for (const r of [0, 0.5, 0.99]) {
        const { state: s, injected } = arrive(state({ lastSavedAt, faults: [] }), T, rng([r]));
        expect(injected).toEqual([]);
        expect(s.faults).toEqual([]);
        expect(s.nextFaultAt).toBe(T + FIRST_FAULT_WAIT_MS);
        expect(decideOnAlarm(s, 1, T + FIRST_FAULT_WAIT_MS - 1)).toBe('none');
        expect(decideOnAlarm(s, 1, T + FIRST_FAULT_WAIT_MS)).toBe('injectFault');
      }
    }
  });

  it('not an immediate fault: refreshing still hands out nothing on arrival, only a 5 s wait', () => {
    let cur = state({ lastSavedAt: T - 1000 });
    for (let i = 0; i < 10; i++) {
      const at = T + i * 2000;
      const { state: s, injected } = arrive(cur, at, rng());
      expect(injected).toEqual([]);
      expect(s.nextFaultAt).toBe(at + FIRST_FAULT_WAIT_MS);
      cur = leave(s, at + 1000);
    }
    expect(cur.faults).toEqual([]);
  });

  it('with a fault already there (left behind or unattended) the 20-40 s rhythm is kept', () => {
    const left = arrive(state({ lastSavedAt: T - 1000, faults: [fault('oxygen')] }), T, rng([0.5]));
    expectNextFaultWithinRange(left.state, T);
    const unattended = arrive(state({ lastSavedAt: T - 3_600_000 }), T, rng([0.5]));
    expect(unattended.injected.length).toBeGreaterThan(0);
    expectNextFaultWithinRange(unattended.state, T);
  });

  it('the wait is shorter than the usual rhythm and longer than the 2.5 s arrival guard', () => {
    expect(FIRST_FAULT_WAIT_MS).toBeLessThan(REFAULT_MIN_MS);
    expect(FIRST_FAULT_WAIT_MS).toBeGreaterThan(2500);
  });

  it('saves now and bumps the version once per added fault', () => {
    const s = state({ lastSavedAt: T - 3_600_000 });
    const { state: after, injected } = arrive(s, T, rng());
    expect(after.lastSavedAt).toBe(T);
    expect(after.version).toBe(s.version + injected.length);
  });

  it('picks distinct healthy modules', () => {
    const { state: s } = arrive(state({ lastSavedAt: T - 3_600_000, faults: [fault('habitat')] }), T, rng([0.99]));
    const modules = s.faults.map((f) => f.moduleId);
    expect(new Set(modules).size).toBe(modules.length);
    for (const m of modules) expect(MODULE_IDS).toContain(m);
  });
});

describe('leave (1 -> 0)', () => {
  it('only stamps the save time, so the stay is not counted as unattended later', () => {
    const s = state({ faults: [fault('oxygen')] });
    const after = leave(s, T + 30_000);
    expect(after).toEqual({ ...s, lastSavedAt: T + 30_000 });
    expect(arrive(after, T + 31_000, rng()).injected).toEqual([]);
  });
});

describe('plannedAlarmAt (neon (c))', () => {
  it('is the earlier of the next fault and the earliest hold expiry', () => {
    expect(plannedAlarmAt(state({ nextFaultAt: T + 30_000 }), T + 3000)).toBe(T + 3000);
    expect(plannedAlarmAt(state({ nextFaultAt: T + 1000 }), T + 3000)).toBe(T + 1000);
    expect(plannedAlarmAt(state({ nextFaultAt: T + 1000 }), null)).toBe(T + 1000);
  });

  it('at the cap only a hold expiry is planned, and with no hold nothing is', () => {
    expect(plannedAlarmAt(dark(), T + 3000)).toBe(T + 3000);
    expect(plannedAlarmAt(dark(), null)).toBeNull();
  });
});

describe('decideAlarm (neon (c), plan A.9)', () => {
  it('deletes the alarm when nobody is connected', () => {
    expect(decideAlarm({ connections: 0, planned: T, current: T + 5 })).toEqual({ kind: 'delete' });
    expect(decideAlarm({ connections: 0, planned: T, current: null })).toEqual({ kind: 'keep' });
  });

  it('sets the planned time when no alarm exists (self-heal) or the alarm is later', () => {
    expect(decideAlarm({ connections: 1, planned: T, current: null })).toEqual({ kind: 'set', at: T });
    expect(decideAlarm({ connections: 2, planned: T, current: T + 10_000 })).toEqual({ kind: 'set', at: T });
  });

  it('keeps an alarm that is already at or before the planned time', () => {
    expect(decideAlarm({ connections: 1, planned: T, current: T })).toEqual({ kind: 'keep' });
    expect(decideAlarm({ connections: 1, planned: T, current: T - 10 })).toEqual({ kind: 'keep' });
  });

  it('plans nothing at the cap with no holds, so no alarm is set', () => {
    const planned = plannedAlarmAt(dark(), null);
    expect(decideAlarm({ connections: 1, planned, current: null })).toEqual({ kind: 'keep' });
  });

  it('at the cap a hold plans its expiry; a repair below the cap plans the next fault again', () => {
    // Hold on a blackout fault: alarm at its expiry.
    expect(decideAlarm({ connections: 1, planned: plannedAlarmAt(dark(), T + 3000), current: null })).toEqual({
      kind: 'set',
      at: T + 3000,
    });
    // The repair brings it to two faults: the next fault is planned again.
    const { state: s } = repair(dark(), 'f-oxygen', T + 1000, rng(), OFF)!;
    const planned = plannedAlarmAt(s, null);
    expect(planned).toBe(s.nextFaultAt);
    expect(decideAlarm({ connections: 1, planned, current: null })).toEqual({ kind: 'set', at: s.nextFaultAt });
  });
});

describe('countPresence', () => {
  it('counts sockets, leaving out the closing one', () => {
    const a = {};
    const b = {};
    expect(countPresence([a, b])).toBe(2);
    expect(countPresence([a, b], b)).toBe(1);
    expect(countPresence([a], b)).toBe(1);
  });
});

describe('toSnapshot / toHistory', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `b${i}`,
    startedAt: T - i * 1000,
    endedAt: T - i * 1000 + 1,
  }));
  const s = state({
    faults: [fault('oxygen')],
    blackouts: many,
    lastRepair: { moduleId: 'comms', at: T - 50 },
    parts: 3,
    lastPartSlot: 179_999_999,
  });

  it('snapshot carries protocol 3, the state, the five newest blackouts and the server time', () => {
    expect(toSnapshot(s, 3, T + 7)).toEqual({
      type: 'snapshot',
      protocol: 3,
      version: 7,
      faults: [fault('oxygen')],
      repairs: 2,
      uptimeStartedAt: s.uptimeStartedAt,
      longestUptimeMs: 0,
      blackout: null,
      blackouts: many.slice(0, 5),
      lastRepair: { moduleId: 'comms', at: T - 50 },
      presence: 3,
      instanceId: 'inst',
      serverNow: T + 7,
      parts: 3,
      lastPartSlot: 179_999_999,
    });
  });

  it('history carries uptime, the blackout in progress and every kept record', () => {
    expect(toHistory(s, T)).toEqual({
      uptimeStartedAt: s.uptimeStartedAt,
      longestUptimeMs: 0,
      blackout: null,
      blackouts: many,
      serverNow: T,
    });
  });
});

/** Parts required: a repair takes one part and is turned away at 0 (plan 009 A.4). */
const ON = { partsRequired: true } as const;
/** The slot `T` falls in; `T` is at its very start. */
const SLOT = partSlot(T);

describe('slotOpen (plan 009 A.3, R5)', () => {
  it('takes the current slot and the one before, never two back', () => {
    for (const at of [T, T + PART_SLOT_MS / 2, T + PART_SLOT_MS - 1]) {
      expect(slotOpen(SLOT, at)).toBe(true);
      expect(slotOpen(SLOT - 1, at)).toBe(true);
      expect(slotOpen(SLOT - 2, at)).toBe(false);
    }
  });

  it('takes the next slot only in the last second of the current one', () => {
    expect(slotOpen(SLOT + 1, T)).toBe(false);
    expect(slotOpen(SLOT + 1, T + PART_SLOT_MS - 1001)).toBe(false);
    expect(slotOpen(SLOT + 1, T + PART_SLOT_MS - 1000)).toBe(true);
    expect(slotOpen(SLOT + 1, T + PART_SLOT_MS - 1)).toBe(true);
    expect(slotOpen(SLOT + 2, T + PART_SLOT_MS - 1)).toBe(false);
  });
});

describe('collect (plan 009 A.3)', () => {
  it('adds one part for the current slot and remembers the slot', () => {
    const before = state();
    const s = collect(before, SLOT, T + 10)!;
    expect(s).toEqual({ ...before, parts: 1, lastPartSlot: SLOT, version: before.version + 1, lastSavedAt: T + 10 });
  });

  it('takes the slot just before and, in its last second, the next one', () => {
    expect(collect(state(), SLOT - 1, T + 10)?.lastPartSlot).toBe(SLOT - 1);
    expect(collect(state(), SLOT + 1, T + PART_SLOT_MS - 500)?.lastPartSlot).toBe(SLOT + 1);
  });

  it('ignores a slot two back or a future slot', () => {
    expect(collect(state(), SLOT - 2, T + 10)).toBeNull();
    expect(collect(state(), SLOT + 1, T + 10)).toBeNull();
    expect(collect(state(), SLOT + 2, T + PART_SLOT_MS - 500)).toBeNull();
  });

  it('counts a slot once: the same slot twice gives +1 only', () => {
    const once = collect(state(), SLOT, T + 10)!;
    expect(collect(once, SLOT, T + 20)).toBeNull();
    expect(once.parts).toBe(1);
  });

  it('never takes a slot at or before the last one collected', () => {
    const s = state({ parts: 1, lastPartSlot: SLOT });
    expect(collect(s, SLOT - 1, T + 10)).toBeNull();
    const ahead = collect(state(), SLOT + 1, T + PART_SLOT_MS - 500)!;
    expect(collect(ahead, SLOT, T + PART_SLOT_MS - 400)).toBeNull();
  });

  it('stops at PARTS_CAP', () => {
    const full = state({ parts: PARTS_CAP, lastPartSlot: SLOT - 1 });
    expect(collect(full, SLOT, T + 10)).toBeNull();
    expect(collect(state({ parts: PARTS_CAP - 1 }), SLOT, T + 10)?.parts).toBe(PARTS_CAP);
  });

  it('works during faults and a blackout, and leaves them alone', () => {
    const before = dark();
    const s = collect(before, SLOT, T + 10)!;
    expect(s.parts).toBe(1);
    expect(s.faults).toEqual(before.faults);
    expect(s.blackout).toEqual(before.blackout);
    expect(s.nextFaultAt).toBe(before.nextFaultAt);
  });

  it('ignores a slot that is not an integer', () => {
    expect(collect(state(), SLOT + 0.5, T + 10)).toBeNull();
    expect(collect(state(), Number.NaN, T + 10)).toBeNull();
  });

  it('does not change the input', () => {
    const before = state();
    const copy = structuredClone(before);
    collect(before, SLOT, T + 10);
    expect(before).toEqual(copy);
  });
});

describe('repair with parts required (plan 009 A.4, A.9)', () => {
  const two = () => state({ faults: [fault('oxygen'), fault('comms')], parts: 1 });

  it('takes one part', () => {
    const r = repair(two(), 'f-oxygen', T, rng(), ON);
    expect(r).not.toBe('noParts');
    expect(r && r !== 'noParts' ? r.state.parts : null).toBe(0);
  });

  it('with an empty store: noParts, nothing changes', () => {
    const s = state({ faults: [fault('oxygen')], parts: 0 });
    const copy = structuredClone(s);
    expect(repair(s, 'f-oxygen', T, rng(), ON)).toBe('noParts');
    expect(s).toEqual(copy);
  });

  it('(R5) an unknown or already repaired fault is null before the parts check', () => {
    expect(repair(state({ parts: 0 }), 'nope', T, rng(), ON)).toBeNull();
    const last = state({ faults: [fault('oxygen')], parts: 1 });
    const first = repair(last, 'f-oxygen', T, rng(), ON);
    if (!first || first === 'noParts') throw new Error('first repair should count');
    expect(first.state.parts).toBe(0);
    expect(repair(first.state, 'f-oxygen', T + 1, rng(), ON)).toBeNull();
  });

  it('one part, two different faults repaired at once: only the first counts', () => {
    const first = repair(two(), 'f-oxygen', T, rng(), ON);
    if (!first || first === 'noParts') throw new Error('first repair should count');
    expect(repair(first.state, 'f-comms', T + 1, rng(), ON)).toBe('noParts');
    expect(first.state.faults.map((f) => f.moduleId)).toEqual(['comms']);
    expect(first.state.repairs).toBe(3);
  });

  it('the generator with the last part still ends the blackout', () => {
    const r = repair(dark({ parts: 1 }), `f-${GENERATOR}`, T, rng(), ON);
    if (!r || r === 'noParts') throw new Error('should count');
    expect(r.state.parts).toBe(0);
    expect(r.blackoutEnd).not.toBeNull();
  });
});

describe('repair with parts not required (plan 009 A.9)', () => {
  it('repairs with an empty store and leaves the store alone', () => {
    const r = repair(state({ faults: [fault('oxygen')], parts: 0 }), 'f-oxygen', T, rng(), OFF)!;
    expect(r.state.parts).toBe(0);
    expect(r.state.faults).toEqual([]);
    const full = repair(state({ faults: [fault('oxygen')], parts: 3 }), 'f-oxygen', T, rng(), OFF)!;
    expect(full.state.parts).toBe(3);
  });

  it('collecting still fills the store', () => {
    expect(collect(state(), SLOT, T)!.parts).toBe(1);
  });
});

describe('withPartDefaults (plan 009 A.1, R3)', () => {
  const old = JSON.parse(PRE009_STORED) as BaseState;

  it('reads a base:v2 from before 009 with an empty store, every old field the same', () => {
    expect(withPartDefaults(old, T)).toEqual({ ...old, parts: 0, lastPartSlot: -1 });
  });

  it('does not change the stored object (the read writes nothing)', () => {
    const copy = structuredClone(old);
    withPartDefaults(old, T);
    expect(old).toEqual(copy);
  });

  it('keeps a 009 store as it is', () => {
    const now = { ...old, parts: 2, lastPartSlot: 179_500_004 };
    expect(withPartDefaults(now, T)).toBe(now);
  });

  it('repairs broken values instead of trusting them', () => {
    const broken = { ...old, parts: 9, lastPartSlot: 'x' } as unknown as BaseState;
    expect(withPartDefaults(broken, T)).toMatchObject({ parts: PARTS_CAP, lastPartSlot: -1 });
    expect(withPartDefaults({ ...old, parts: -1 } as BaseState, T).parts).toBe(0);
    expect(withPartDefaults({ ...old, parts: 2.5 } as BaseState, T).parts).toBe(0);
  });

  it('cuts parts the same way as the client parser (clampParts)', () => {
    for (const parts of [-3, 0, 3, 5, 6, 99]) {
      expect(withPartDefaults({ ...old, parts, lastPartSlot: -1 }, T).parts).toBe(clampParts(parts));
    }
  });

  it('reads a lastPartSlot past the next slot as the next slot, without changing storage', () => {
    const SLOT_T = partSlot(T);
    const ahead = { ...old, parts: 1, lastPartSlot: SLOT_T + 500 };
    const copy = structuredClone(ahead);
    const read = withPartDefaults(ahead, T);
    expect(read.lastPartSlot).toBe(SLOT_T + 1);
    expect(ahead).toEqual(copy);
    // So the slot after that can be collected again.
    expect(collect(read, SLOT_T + 2, (SLOT_T + 2) * PART_SLOT_MS)?.lastPartSlot).toBe(SLOT_T + 2);
    // A next, current or past slot is left as it is.
    for (const lastPartSlot of [SLOT_T + 1, SLOT_T, SLOT_T - 3]) {
      const kept = { ...old, parts: 1, lastPartSlot };
      expect(withPartDefaults(kept, T)).toBe(kept);
    }
  });

  it('an early collect survives the reload before the next message: the same piece cannot be collected twice (Codex P2)', () => {
    // The last second of slot S: collect accepts S + 1.
    const S = 1;
    const late = (S + 1) * PART_SLOT_MS - 1;
    const start = { ...old, parts: 0, lastPartSlot: -1 };
    const first = collect(withPartDefaults(start, late), S + 1, late)!;
    expect(first.parts).toBe(1);
    expect(first.lastPartSlot).toBe(S + 1);
    // BaseRoom reloads storage for every message: the reload must keep the early marker.
    const reloaded = withPartDefaults(structuredClone(first), late);
    expect(reloaded.lastPartSlot).toBe(S + 1);
    expect(collect(reloaded, S + 1, late)).toBeNull();
  });
});
