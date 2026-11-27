import { describe, expect, it } from 'vitest';
import { GENERATOR, HISTORY_BLACKOUTS, MAX_FAULTS, MODULE_IDS, type Fault, type ModuleId } from '../shared/protocol';
import {
  MIN_UNATTENDED_MS,
  REFAULT_MAX_MS,
  REFAULT_MIN_MS,
  UNATTENDED_FAULT_CAP,
  arrive,
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
  toHistory,
  toSnapshot,
  type BaseState,
  type Rng,
} from './state';

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
    const { state: s, fault: f, blackoutEnd } = repair(two, 'f-oxygen', T, rng())!;
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
    const once = repair(two, 'f-oxygen', T, rng())!.state;
    expect(repair(once, 'f-oxygen', T + 1, rng())).toBeNull();
    expect(repair(two, 'nope', T, rng())).toBeNull();
  });

  it('does not change its input', () => {
    const copy = structuredClone(two);
    repair(two, 'f-oxygen', T, rng());
    expect(two).toEqual(copy);
  });

  it('reschedules the next fault when a repair brings the base below the cap (neon (c))', () => {
    const { state: s } = repair(dark(), 'f-oxygen', T, rng())!;
    expect(s.faults).toHaveLength(2);
    expectNextFaultWithinRange(s, T);
  });

  it('no fault lands within 2.5 s of a repair', () => {
    const { state: s } = repair(two, 'f-comms', T, rng([0]))!;
    expect(decideOnAlarm(s, 1, T + 2500)).toBe('none');
  });
});

describe('blackout end', () => {
  it('does not end when another module is repaired', () => {
    const { state: s, blackoutEnd } = repair(dark(), 'f-comms', T, rng())!;
    expect(s.blackout).not.toBeNull();
    expect(s.uptimeStartedAt).toBeNull();
    expect(blackoutEnd).toBeNull();
  });

  it('ends when the generator is repaired: history filled, new uptime from now, other faults stay', () => {
    const { state: s, blackoutEnd } = repair(dark(), `f-${GENERATOR}`, T, rng())!;
    expect(s.blackout).toBeNull();
    expect(s.blackouts[0]).toEqual({ id: 'b1', startedAt: T - 10_000, endedAt: T });
    expect(s.uptimeStartedAt).toBe(T);
    expect(s.longestUptimeMs).toBe(7_200_000);
    expect(s.faults.map((f) => f.moduleId)).toEqual(['oxygen', 'comms']);
    expect(blackoutEnd).toEqual({ blackoutId: 'b1', endedAt: T, uptimeStartedAt: T, longestUptimeMs: 7_200_000 });
  });

  it('reschedules the next fault so nothing lands within 2.5 s of the recovery', () => {
    const { state: s } = repair(dark(), `f-${GENERATOR}`, T, rng([0]))!;
    expectNextFaultWithinRange(s, T);
    expect(decideOnAlarm(s, 1, T + 2500)).toBe('none');
  });

  it('a repeated generator repair does not end the blackout twice', () => {
    const once = repair(dark(), `f-${GENERATOR}`, T, rng())!.state;
    expect(repair(once, `f-${GENERATOR}`, T + 10, rng())).toBeNull();
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
      expectNextFaultWithinRange(s, T);
      expect(decideOnAlarm(s, 1, T + 2500)).toBe('none');
    }
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
    const { state: s } = repair(dark(), 'f-oxygen', T + 1000, rng())!;
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
  });

  it('snapshot carries protocol 2, the state, the five newest blackouts and the server time', () => {
    expect(toSnapshot(s, 3, T + 7)).toEqual({
      type: 'snapshot',
      protocol: 2,
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
