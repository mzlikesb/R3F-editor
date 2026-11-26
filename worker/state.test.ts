import { describe, expect, it } from 'vitest';
import type { Fault } from '../shared/protocol';
import {
  REFAULT_MAX_MS,
  REFAULT_MIN_MS,
  countPresence,
  decideOnAlarm,
  decideOnConnect,
  ensureFault,
  initialState,
  needsSelfHeal,
  nextFaultDelayMs,
  repair,
  shouldFirstVisitFault,
  toSnapshot,
  type BaseState,
} from './state';

const FAULT: Fault = { id: 'f1', moduleId: 'generator', createdAt: 1000 };

function broken(overrides: Partial<BaseState> = {}): BaseState {
  return { fault: FAULT, repairs: 2, version: 7, instanceId: 'inst', ...overrides };
}

function healthy(overrides: Partial<BaseState> = {}): BaseState {
  return { fault: null, repairs: 2, version: 7, instanceId: 'inst', ...overrides };
}

describe('initialState', () => {
  it('starts healthy with no repairs at version 0', () => {
    expect(initialState('inst')).toEqual({ fault: null, repairs: 0, version: 0, instanceId: 'inst' });
  });
});

describe('repair', () => {
  it('clears the matching fault, adds one repair, bumps the version', () => {
    const next = repair(broken(), 'f1');
    expect(next.fault).toBeNull();
    expect(next.repairs).toBe(3);
    expect(next.version).toBe(8);
    expect(next.instanceId).toBe('inst');
  });

  it('is idempotent: repairing the same fault twice counts once', () => {
    const once = repair(broken(), 'f1');
    const twice = repair(once, 'f1');
    expect(twice).toBe(once);
    expect(twice.repairs).toBe(3);
    expect(twice.version).toBe(8);
  });

  it('ignores a different fault id', () => {
    const state = broken();
    expect(repair(state, 'other')).toBe(state);
  });

  it('does nothing when there is no fault', () => {
    const state = healthy();
    expect(repair(state, 'f1')).toBe(state);
  });

  it('does not mutate its input', () => {
    const state = broken();
    repair(state, 'f1');
    expect(state).toEqual(broken());
  });
});

describe('ensureFault', () => {
  it('creates a generator fault with a new id and bumps the version', () => {
    const next = ensureFault(healthy(), 5000, () => 'new-id');
    expect(next.fault).toEqual({ id: 'new-id', moduleId: 'generator', createdAt: 5000 });
    expect(next.version).toBe(8);
    expect(next.repairs).toBe(2);
  });

  it('keeps an existing fault and the version', () => {
    const state = broken();
    expect(ensureFault(state, 5000, () => 'new-id')).toBe(state);
  });

  it('gives each new fault a fresh id', () => {
    let n = 0;
    const newId = () => `id-${++n}`;
    const first = ensureFault(healthy(), 1, newId);
    const second = ensureFault(repair(first, first.fault!.id), 2, newId);
    expect(second.fault!.id).not.toBe(first.fault!.id);
  });
});

describe('version', () => {
  it('rises by one on every stored change and never otherwise', () => {
    let state = initialState('inst');
    state = ensureFault(state, 1, () => 'a');
    expect(state.version).toBe(1);
    state = ensureFault(state, 2, () => 'b');
    expect(state.version).toBe(1);
    state = repair(state, 'a');
    expect(state.version).toBe(2);
    state = repair(state, 'a');
    expect(state.version).toBe(2);
    state = ensureFault(state, 3, () => 'c');
    expect(state.version).toBe(3);
  });
});

describe('shouldFirstVisitFault', () => {
  it('fires when the first person arrives to a healthy base with nothing scheduled', () => {
    expect(shouldFirstVisitFault({ connections: 1, fault: null, hasAlarm: false })).toBe(true);
  });

  it('does not fire when a re-fault is already scheduled (someone just repaired)', () => {
    expect(shouldFirstVisitFault({ connections: 1, fault: null, hasAlarm: true })).toBe(false);
  });

  it('does not fire when there is already a fault', () => {
    expect(shouldFirstVisitFault({ connections: 1, fault: FAULT, hasAlarm: false })).toBe(false);
  });

  it('does not fire when others were already connected', () => {
    expect(shouldFirstVisitFault({ connections: 2, fault: null, hasAlarm: false })).toBe(false);
  });
});

describe('needsSelfHeal', () => {
  it('is true when someone is here with no fault and no alarm', () => {
    expect(needsSelfHeal({ connections: 1, fault: null, hasAlarm: false })).toBe(true);
    expect(needsSelfHeal({ connections: 3, fault: null, hasAlarm: false })).toBe(true);
  });

  it('is false with nobody here, a fault, or an alarm', () => {
    expect(needsSelfHeal({ connections: 0, fault: null, hasAlarm: false })).toBe(false);
    expect(needsSelfHeal({ connections: 2, fault: FAULT, hasAlarm: false })).toBe(false);
    expect(needsSelfHeal({ connections: 2, fault: null, hasAlarm: true })).toBe(false);
  });
});

describe('decideOnConnect', () => {
  it('creates a fault on a first visit', () => {
    expect(decideOnConnect({ connections: 1, fault: null, hasAlarm: false })).toBe('createFault');
  });

  it('reschedules (self-heal) when others are here and nothing is broken or scheduled', () => {
    expect(decideOnConnect({ connections: 2, fault: null, hasAlarm: false })).toBe('scheduleAlarm');
  });

  it('does nothing when a fault exists or a re-fault is scheduled', () => {
    expect(decideOnConnect({ connections: 1, fault: FAULT, hasAlarm: false })).toBe('none');
    expect(decideOnConnect({ connections: 1, fault: null, hasAlarm: true })).toBe('none');
    expect(decideOnConnect({ connections: 3, fault: FAULT, hasAlarm: true })).toBe('none');
  });
});

describe('decideOnAlarm', () => {
  it('creates a fault when someone is here and nothing is broken', () => {
    expect(decideOnAlarm({ connections: 1, fault: null })).toBe('createFault');
  });

  it('is idempotent: does nothing when a fault already exists (retry)', () => {
    expect(decideOnAlarm({ connections: 1, fault: FAULT })).toBe('none');
  });

  it('does nothing when everyone left', () => {
    expect(decideOnAlarm({ connections: 0, fault: null })).toBe('none');
  });
});

describe('nextFaultDelayMs', () => {
  it('stays within 20 to 40 seconds', () => {
    expect(REFAULT_MIN_MS).toBe(20_000);
    expect(REFAULT_MAX_MS).toBe(40_000);
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      const delay = nextFaultDelayMs(() => r);
      expect(delay).toBeGreaterThanOrEqual(REFAULT_MIN_MS);
      expect(delay).toBeLessThanOrEqual(REFAULT_MAX_MS);
    }
  });

  it('uses the random source', () => {
    expect(nextFaultDelayMs(() => 0)).toBeLessThan(nextFaultDelayMs(() => 0.99));
  });
});

describe('countPresence', () => {
  it('counts all sockets', () => {
    expect(countPresence(['a', 'b', 'c'])).toBe(3);
    expect(countPresence([])).toBe(0);
  });

  it('leaves out the closing socket', () => {
    const a = {};
    const b = {};
    expect(countPresence([a, b], b)).toBe(1);
  });

  it('does not go below the real count when the closing socket is already gone', () => {
    const a = {};
    const b = {};
    expect(countPresence([a], b)).toBe(1);
  });
});

describe('toSnapshot', () => {
  it('carries state, presence, version and instanceId', () => {
    expect(toSnapshot(broken(), 4)).toEqual({
      type: 'snapshot',
      version: 7,
      fault: FAULT,
      repairs: 2,
      presence: 4,
      instanceId: 'inst',
    });
  });
});
