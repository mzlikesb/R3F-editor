import { beforeEach, describe, expect, it } from 'vitest';
import type { BlackoutStart, ClientMessage, FaultMessage, RepairedMessage, SnapshotMessage } from '../shared/protocol';
import { initialFeedback } from './feedback';
import { HOLD_MS, initialRepairUi } from './hold';
import {
  selectActivity,
  selectAnyFault,
  selectBlackout,
  selectFaults,
  selectModuleFault,
  selectModuleStatus,
  selectOthersHolding,
  selectBaseIn,
  selectReady,
  selectServerNow,
  setClientSender,
  useStore,
} from './store';
import { initialSync } from './sync';
import { shouldShake } from './scene/shake';

const T = 1_800_000_000_000;
const oxy = { id: 'f1', moduleId: 'oxygen', createdAt: T - 9000 } as const;
const gen = { id: 'g1', moduleId: 'generator', createdAt: T - 8000 } as const;

function snapshot(overrides: Partial<SnapshotMessage> = {}): SnapshotMessage {
  return {
    type: 'snapshot',
    protocol: 2,
    version: 5,
    faults: [oxy],
    repairs: 2,
    uptimeStartedAt: T - 60_000,
    longestUptimeMs: 0,
    blackout: null,
    blackouts: [],
    lastRepair: null,
    presence: 2,
    instanceId: 'inst',
    serverNow: T,
    parts: 0,
    lastPartSlot: -1,
    ...overrides,
  };
}

function repaired(mine: boolean, overrides: Partial<RepairedMessage> = {}): RepairedMessage {
  return {
    type: 'repaired',
    version: 6,
    faultId: 'f1',
    moduleId: 'oxygen',
    repairs: 3,
    mine,
    helped: false,
    helpers: 0,
    at: T + 100,
    blackoutEnd: null,
    parts: null,
    serverNow: null,
    ...overrides,
  };
}

const faultMsg = (overrides: Partial<FaultMessage> = {}): FaultMessage => ({
  type: 'fault',
  version: 6,
  fault: gen,
  blackoutStart: null,
  ...overrides,
});

const s = () => useStore.getState();
let sent: ClientMessage[] = [];

beforeEach(() => {
  useStore.setState({
    sync: initialSync,
    connection: 'open',
    selected: null,
    historyOpen: false,
    repair: initialRepairUi,
    feedback: initialFeedback,
  });
  sent = [];
  setClientSender((msg) => sent.push(msg));
});

describe('store.receive', () => {
  it('applies messages to the synced base', () => {
    s().receive(snapshot(), 0, T);
    expect(s().sync.base?.faults).toEqual([oxy]);
    s().receive(repaired(false), 10, T);
    expect(s().sync.base?.faults).toEqual([]);
    expect(s().sync.base?.repairs).toBe(3);
  });

  it('my repair: toast, effect on that module, the pending hold ends', () => {
    s().receive(snapshot(), 0, T);
    s().select('oxygen');
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().dispatchHold({ type: 'tick', now: HOLD_MS });
    expect(s().repair.hold.kind).toBe('pending');

    s().receive(repaired(true), HOLD_MS + 50, T);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().feedback.toast).toMatchObject({ kind: 'mine', moduleId: 'oxygen' });
    expect(s().feedback.effect).toEqual({ outcome: 'mine', moduleId: 'oxygen', seq: 1, at: HOLD_MS + 50 });
  });

  it('a tab holding the same fault hears "someone was a step ahead"', () => {
    s().receive(snapshot(), 0, T);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().receive(repaired(false), 400, T);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().feedback.toast?.kind).toBe('beaten');
  });

  it('a tab the server counts as a helper hears "we repaired it together" (#56)', () => {
    s().receive(snapshot(), 0, T);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().receive(repaired(false, { helped: true, helpers: 1 }), 400, T);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().feedback.toast).toMatchObject({ kind: 'helped', moduleId: 'oxygen' });
    expect(s().feedback.effect).toMatchObject({ outcome: 'helped', moduleId: 'oxygen' });
    expect(s().sync.base?.repairs).toBe(3);
  });

  it('an idle tab hears "someone repaired <module>"', () => {
    s().receive(snapshot(), 0, T);
    s().receive(repaired(false), 400, T);
    expect(s().feedback.toast).toMatchObject({ kind: 'other', moduleId: 'oxygen' });
  });

  it('a live fault toasts with its module; faults in the arrival snapshot do not', () => {
    s().receive(snapshot({ faults: [oxy, gen] }), 0, T);
    expect(s().feedback.toast).toBeNull();
    s().receive(faultMsg({ fault: { id: 'c1', moduleId: 'comms', createdAt: T } }), 500, T);
    expect(s().feedback.toast).toMatchObject({ kind: 'fault', moduleId: 'comms' });
  });

  it('combo: my repair, a helped one, a reconnect, my next repair is x3; others leave it alone (008 C.2, R7)', () => {
    const fault = (id: string, moduleId: 'oxygen' | 'comms' | 'habitat') => ({ id, moduleId, createdAt: T });
    s().receive(snapshot({ faults: [fault('a', 'oxygen'), fault('b', 'comms')] }), 0, T);
    s().receive(repaired(true, { faultId: 'a', version: 6 }), 1000, T);
    expect(s().feedback.toast).toMatchObject({ kind: 'mine', combo: 1 });
    s().receive(repaired(false, { faultId: 'b', moduleId: 'comms', version: 7, helped: true, helpers: 1 }), 5000, T);
    expect(s().feedback.toast).toMatchObject({ kind: 'helped', combo: 2 });
    // The socket drops and comes back: a fresh snapshot does not touch the combo.
    s().receive(snapshot({ version: 8, faults: [fault('c', 'habitat'), fault('d', 'oxygen')] }), 9000, T);
    s().receive(repaired(false, { faultId: 'c', moduleId: 'habitat', version: 9 }), 10_000, T);
    expect(s().feedback.toast).toMatchObject({ kind: 'other', combo: 0 });
    s().receive(repaired(true, { faultId: 'd', version: 10 }), 12_000, T);
    expect(s().feedback.toast).toMatchObject({ kind: 'mine', combo: 3 });
  });

  it('a reconnect snapshot keeps the latest effect as is, so it starts no shake (008 C.1)', () => {
    s().receive(snapshot(), 0, T);
    s().receive(repaired(true), 100, T);
    const effect = s().feedback.effect;
    s().receive(snapshot({ version: 7, faults: [] }), 200, T);
    expect(shouldShake(effect, s().feedback.effect)).toBe(false);
  });

  it('a blackout seen starting live stamps blackoutLiveAt; one in a snapshot does not (008 C.3, R6)', () => {
    const start = {
      blackout: { id: 'b1', startedAt: T },
      uptimeStartedAt: null,
      longestUptimeMs: 60_000,
      record: { id: 'b1', startedAt: T, endedAt: null },
    } satisfies BlackoutStart;
    useStore.setState({ blackoutLiveAt: null });
    s().receive(snapshot({ faults: [oxy] }), 0, T);
    s().receive(faultMsg({ blackoutStart: start }), 700, T);
    expect(selectBlackout(s())).toBe(true);
    expect(s().blackoutLiveAt).toBe(700);

    // Joining (or reconnecting) into a blackout: the snapshot carries it, nothing is stamped.
    useStore.setState({ sync: initialSync, blackoutLiveAt: null });
    s().receive(snapshot({ faults: [oxy, gen], blackout: { id: 'b1', startedAt: T } }), 900, T);
    expect(selectBlackout(s())).toBe(true);
    expect(s().blackoutLiveAt).toBeNull();
  });

  it('ignores a stale repaired: no toast, no effect, no hold change', () => {
    s().receive(snapshot({ version: 10 }), 0, T);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().receive(repaired(true, { version: 9 }), 100, T);
    expect(s().feedback.toast).toBeNull();
    expect(s().feedback.effect).toBeNull();
    expect(s().repair.hold.kind).toBe('holding');
  });

  it('#15-4: a snapshot without the held fault cancels the hold and sends release', () => {
    s().receive(snapshot(), 0, T);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    sent = [];
    s().receive(snapshot({ version: 6, faults: [] }), 300, T);
    expect(s().repair.hold.kind).toBe('idle');
    expect(sent).toEqual([{ type: 'release', faultId: 'f1' }]);
  });

  it('#15-1: a snapshot from another base is taken whatever its version', () => {
    s().receive(snapshot({ version: 50 }), 0, T);
    s().receive(snapshot({ version: 1, instanceId: 'other', faults: [] }), 10, T);
    expect(s().sync.base?.instanceId).toBe('other');
    expect(selectAnyFault(s())).toBe(false);
  });

  it('sets the server clock from the snapshot', () => {
    s().receive(snapshot({ serverNow: T + 4000 }), 0, T);
    expect(selectServerNow(s(), T + 1000)).toBe(T + 5000);
  });
});

describe('store.markIncompatible', () => {
  it('locks repairs', () => {
    s().receive(snapshot(), 0, T);
    s().markIncompatible();
    expect(s().sync.incompatible).toBe(true);
  });
});

describe('store.select and holds (#15-4)', () => {
  it('cancels a hold when the selection moves away, sending release, and nothing completes', () => {
    s().receive(snapshot(), 0, T);
    s().select('oxygen');
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    expect(sent).toEqual([{ type: 'hold', faultId: 'f1' }]);

    s().select(null);
    expect(s().repair.hold.kind).toBe('idle');
    s().dispatchHold({ type: 'tick', now: 2000 });
    expect(sent).toEqual([
      { type: 'hold', faultId: 'f1' },
      { type: 'release', faultId: 'f1' },
    ]);
  });

  it('leaves the hold alone when the same module is selected again', () => {
    s().select('oxygen');
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().select('oxygen');
    expect(s().repair.hold.kind).toBe('holding');
  });

  it('dismisses the hint once any module is tapped, not on clearing', () => {
    s().select(null);
    expect(s().feedback.hintDismissed).toBe(false);
    s().select('greenhouse');
    expect(s().feedback.hintDismissed).toBe(true);
  });
});

describe('record panel and repair panel', () => {
  it('never open together', () => {
    s().select('oxygen');
    s().openHistory(true);
    expect(s().historyOpen).toBe(true);
    expect(s().selected).toBeNull();

    s().select('comms');
    expect(s().historyOpen).toBe(false);
    expect(s().selected).toBe('comms');

    s().openHistory(true);
    s().openHistory(false);
    expect(s().historyOpen).toBe(false);
  });

  it('opening the record panel mid-hold cancels the hold', () => {
    s().receive(snapshot(), 0, T);
    s().select('oxygen');
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().openHistory(true);
    expect(s().repair.hold.kind).toBe('idle');
    expect(sent.at(-1)).toEqual({ type: 'release', faultId: 'f1' });
  });
});

describe('selectors', () => {
  it('report faults per module, stable between unrelated messages', () => {
    expect(selectFaults(s())).toEqual([]);
    expect(selectModuleStatus(s(), 'oxygen')).toBe('ok');

    s().receive(snapshot({ faults: [oxy, gen] }), 0, T);
    const faults = selectFaults(s());
    expect(faults).toEqual([oxy, gen]);
    expect(selectModuleFault(s(), 'generator')).toEqual(gen);
    expect(selectModuleFault(s(), 'comms')).toBeNull();
    expect(selectModuleStatus(s(), 'oxygen')).toBe('fault');
    expect(selectModuleStatus(s(), 'habitat')).toBe('ok');
    expect(selectAnyFault(s())).toBe(true);

    s().receive({ type: 'presence', count: 5 }, 10, T);
    expect(selectFaults(s())).toBe(faults);
  });

  it('report the blackout', () => {
    s().receive(snapshot(), 0, T);
    expect(selectBlackout(s())).toBe(false);
    s().receive(snapshot({ version: 6, blackout: { id: 'b1', startedAt: T }, uptimeStartedAt: null }), 0, T);
    expect(selectBlackout(s())).toBe(true);
  });

  it("(b) others holding is exactly what the server sent; this tab's own hold is never subtracted", () => {
    s().receive(snapshot({ faults: [oxy, gen] }), 0, T);
    s().select('oxygen');
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });

    s().receive({ type: 'activity', holds: { f1: 1 } }, 10, T);
    expect(selectOthersHolding(s(), 'oxygen')).toBe(1);
    expect(selectOthersHolding(s(), 'generator')).toBe(0);
    expect(selectOthersHolding(s(), 'comms')).toBe(0);

    s().receive({ type: 'activity', holds: {} }, 20, T);
    expect(selectOthersHolding(s(), 'oxygen')).toBe(0);
    expect(selectActivity(s())).toEqual({});
  });
});

describe('store.setLoaded', () => {
  it('latches once the scene is in', () => {
    useStore.setState({ loaded: false });
    s().setLoaded();
    expect(s().loaded).toBe(true);
  });
});

describe('selectReady (playtest #47: no "healthy" while loading)', () => {
  it('is true once the scene is in and a base is known', () => {
    useStore.setState({ loaded: false, sync: initialSync });
    expect(selectReady(s())).toBe(false);
    s().setLoaded();
    expect(selectReady(s())).toBe(false);
    s().receive(snapshot(), 0, T);
    expect(selectReady(s())).toBe(true);
  });
});

describe('selectBaseIn (#61: labels mount before the scene finishes loading)', () => {
  it('is true from the first snapshot on, without waiting for setLoaded', () => {
    useStore.setState({ loaded: false, sync: initialSync });
    expect(selectBaseIn(s())).toBe(false);
    s().receive(snapshot(), 0, T);
    expect(selectBaseIn(s())).toBe(true);
    expect(selectReady(s())).toBe(false);
    s().setLoaded();
    expect(selectReady(s())).toBe(true);
  });
});
