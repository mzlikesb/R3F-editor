import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BlackoutStart,
  ClientMessage,
  FaultMessage,
  PartsMessage,
  RepairedMessage,
  SnapshotMessage,
} from '../shared/protocol';
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
  selectPartsChip,
  selectReady,
  selectServerNow,
  setClientSender,
  useStore,
} from './store';
import { initialSync } from './sync';
import { PICKUP_TIMEOUT_MS, idlePickup, initialChipFx, initialFlight, initialPing } from './parts';
import { PARTS_CAP, PART_SLOT_MS, partSlot } from '../shared/parts';
import { shouldShake } from './scene/shake';

const T = 1_800_000_000_000;
const oxy = { id: 'f1', moduleId: 'oxygen', createdAt: T - 9000 } as const;
const gen = { id: 'g1', moduleId: 'generator', createdAt: T - 8000 } as const;

function snapshot(overrides: Partial<SnapshotMessage> = {}): SnapshotMessage {
  return {
    type: 'snapshot',
    protocol: 3,
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
    parts: 2,
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
    pickup: idlePickup,
    partPing: initialPing,
    partsNotice: false,
    chipFx: initialChipFx,
    flight: initialFlight,
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

describe('parts: picking up a piece (plan 009 B.2, R5)', () => {
  /** The server clock is 1 s ahead of this tab's. */
  const AHEAD = 1000;
  const slotAt = (dateNow: number) => partSlot(dateNow + AHEAD);
  const join = (overrides: Partial<SnapshotMessage> = {}) =>
    s().receive(snapshot({ serverNow: T + AHEAD, parts: 0, ...overrides }), 0, T);
  const partsMsg = (overrides: Partial<PartsMessage> = {}): PartsMessage => ({
    type: 'parts',
    version: 6,
    count: 1,
    slot: slotAt(T),
    mine: true,
    serverNow: T + AHEAD,
    ...overrides,
  });

  it('a tap sends collect for the slot of server time and hides the piece until the answer', () => {
    join();
    s().collectPiece(10, T);
    expect(sent).toEqual([{ type: 'collect', slot: slotAt(T) }]);
    expect(s().pickup).toMatchObject({ kind: 'pending', slot: slotAt(T) });
    s().collectPiece(20, T);
    expect(sent).toHaveLength(1);
  });

  it('my parts arrives: the store count goes up and the pick-up ends', () => {
    join();
    s().collectPiece(10, T);
    s().receive(partsMsg(), 50, T);
    expect(s().sync.base?.parts).toBe(1);
    expect(s().pickup).toEqual(idlePickup);
  });

  it('someone else got my piece first: the pick-up ends at once', () => {
    join();
    s().collectPiece(10, T);
    s().receive(partsMsg({ mine: false }), 50, T);
    expect(s().pickup).toEqual(idlePickup);
  });

  it('the store reaching the cap ends it at once', () => {
    join();
    s().collectPiece(10, T);
    s().receive(partsMsg({ slot: slotAt(T) - 1, count: PARTS_CAP, mine: false }), 50, T);
    expect(s().pickup).toEqual(idlePickup);
  });

  it('a reconnect snapshot ends it at once', () => {
    join();
    s().collectPiece(10, T);
    join({ version: 6 });
    expect(s().pickup).toEqual(idlePickup);
  });

  it(`no answer within ${PICKUP_TIMEOUT_MS} ms gives the piece back`, () => {
    join();
    s().collectPiece(10, T);
    s().dispatchPickup({ type: 'tick', now: 10 + PICKUP_TIMEOUT_MS });
    expect(s().pickup).toEqual(idlePickup);
  });

  describe('the give-back timer', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('gives the piece back even when the timer fires a little early on the frame clock (QA)', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      // Timers and performance.now() drift apart: the timer fires 1 ms before the deadline on that clock.
      vi.spyOn(performance, 'now').mockReturnValue(10 + PICKUP_TIMEOUT_MS - 1);
      join();
      s().collectPiece(10, T);
      expect(s().pickup.kind).toBe('pending');
      vi.advanceTimersByTime(PICKUP_TIMEOUT_MS);
      expect(s().pickup).toEqual(idlePickup);
    });
  });

  it('takes no taps while disconnected, nor on a piece already collected or at the cap', () => {
    join();
    s().setConnection('reconnecting');
    s().collectPiece(10, T);
    s().setConnection('open');
    join({ version: 6, lastPartSlot: slotAt(T) });
    s().collectPiece(10, T);
    join({ version: 7, parts: PARTS_CAP });
    s().collectPiece(10, T);
    expect(sent).toEqual([]);
  });
});

describe('parts: repairing with the store (plan 009 B.4, B.5)', () => {
  it('a hold stops when the store runs dry under it, with the notice', () => {
    s().receive(snapshot({ faults: [oxy, gen], parts: 1 }), 0, T);
    s().select('oxygen');
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().receive(repaired(false, { faultId: 'g1', moduleId: 'generator', parts: 0 }), 300, T);
    expect(s().repair.hold.kind).toBe('idle');
    expect(sent).toContainEqual({ type: 'release', faultId: 'f1' });
    expect(s().partsNotice).toBe(true);
  });

  it('repairRejected ends the wait with the same notice', () => {
    s().receive(snapshot({ parts: 1 }), 0, T);
    s().select('oxygen');
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().dispatchHold({ type: 'tick', now: HOLD_MS });
    s().receive({ type: 'repairRejected', faultId: 'f1', reason: 'noParts' }, HOLD_MS + 50, T);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().partsNotice).toBe(true);
  });

  it('the notice goes once the store has a part again, or the selection moves', () => {
    useStore.setState({ partsNotice: true });
    s().receive(snapshot({ parts: 0 }), 0, T);
    expect(s().partsNotice).toBe(true);
    s().receive({ type: 'parts', version: 6, count: 1, slot: partSlot(T), mine: false, serverNow: T }, 10, T);
    expect(s().partsNotice).toBe(false);
    useStore.setState({ partsNotice: true });
    s().select('comms');
    expect(s().partsNotice).toBe(false);
  });
});

describe('parts: "pick one up first" and the ring ping (plan 009 B.4, R5)', () => {
  /** A slot boundary, so the next piece is a whole slot away. */
  const START = (partSlot(T) + 1) * PART_SLOT_MS;
  const slot = partSlot(START);

  it('clears the selection and pings the piece that is out', () => {
    s().receive(snapshot({ parts: 0, serverNow: START }), 0, START);
    s().select('oxygen');
    s().fetchParts(START);
    expect(s().selected).toBeNull();
    expect(s().partPing).toEqual({ seq: 1, slot, waitFor: null });
  });

  it('with this slot taken, pings the next piece when it falls', () => {
    s().receive(snapshot({ parts: 0, lastPartSlot: slot, serverNow: START }), 0, START);
    s().select('oxygen');
    s().fetchParts(START);
    expect(s().partPing).toEqual({ ...initialPing, waitFor: slot + 1 });
    s().checkPartPing(START + PART_SLOT_MS - 1);
    expect(s().partPing.seq).toBe(0);
    s().checkPartPing(START + PART_SLOT_MS);
    expect(s().partPing).toEqual({ seq: 1, slot: slot + 1, waitFor: null });
  });

  it('selecting a module cancels the wait', () => {
    s().receive(snapshot({ parts: 0, lastPartSlot: slot, serverNow: START }), 0, START);
    s().fetchParts(START);
    s().select('comms');
    s().checkPartPing(START + PART_SLOT_MS);
    expect(s().partPing).toEqual(initialPing);
  });

  it('the store getting a part cancels the wait', () => {
    s().receive(snapshot({ parts: 0, lastPartSlot: slot, serverNow: START }), 0, START);
    s().fetchParts(START);
    s().receive({ type: 'parts', version: 6, count: 1, slot, mine: false, serverNow: START + 10 }, 10, START + 10);
    s().checkPartPing(START + PART_SLOT_MS);
    expect(s().partPing).toEqual(initialPing);
  });
});

describe('selectPartsChip (QA: no 0/5 before the store is known)', () => {
  it('is null until a WS snapshot is in, then the store count', () => {
    expect(selectPartsChip(s())).toBeNull();
    s().applyRest(snapshot({ parts: 3 }), T);
    expect(selectPartsChip(s())).toBeNull();
    s().receive(snapshot({ parts: 3 }), 0, T);
    expect(selectPartsChip(s())).toBe(3);
  });
});

describe('the parts chip reacts (009-2 playtest)', () => {
  const partsAt = (count: number, mine: boolean, version: number): PartsMessage => ({
    type: 'parts',
    version,
    count,
    slot: partSlot(T) + version,
    mine,
    serverNow: T,
  });

  it("+1 on my pick-up (strong) and on someone else's; nothing on a snapshot", () => {
    s().receive(snapshot({ parts: 1 }), 0, T);
    expect(s().chipFx.seq).toBe(0);
    s().receive(partsAt(2, true, 6), 10, T);
    expect(s().chipFx).toEqual({ seq: 1, delta: 1, mine: true });
    s().receive(partsAt(3, false, 7), 20, T);
    expect(s().chipFx).toEqual({ seq: 2, delta: 1, mine: false });
    s().receive(snapshot({ version: 9, parts: 4 }), 30, T);
    expect(s().chipFx.seq).toBe(2);
  });

  it('-1 when a repair uses a part, whoever made it; the other toast says a part was used', () => {
    s().receive(snapshot({ parts: 2 }), 0, T);
    s().receive(repaired(false, { parts: 1 }), 10, T);
    expect(s().chipFx).toEqual({ seq: 1, delta: -1, mine: false });
    expect(s().feedback.toast).toMatchObject({ kind: 'other', part: true });
  });

  it('a pick-up tap with a screen point starts the flight to the chip', () => {
    s().receive(snapshot({ parts: 0 }), 0, T);
    s().collectPiece(10, T, { x: 120, y: 480 });
    expect(s().flight).toEqual({ seq: 1, x: 120, y: 480 });
  });
});

describe('store.markModelIn (the loading pill waits for the module models)', () => {
  it('counts each module once', () => {
    useStore.setState({ modelsIn: [] });
    s().markModelIn('oxygen');
    s().markModelIn('oxygen');
    s().markModelIn('generator');
    expect(s().modelsIn).toEqual(['oxygen', 'generator']);
  });
});

describe('pingNextPiece (a tap where a piece just was)', () => {
  it('keeps the selection and pings the piece out now, or the next one', () => {
    const START = (partSlot(T) + 1) * PART_SLOT_MS;
    s().receive(snapshot({ parts: 0, lastPartSlot: partSlot(START), serverNow: START }), 0, START);
    s().select('oxygen');
    s().pingNextPiece(START);
    expect(s().selected).toBe('oxygen');
    expect(s().partPing.waitFor).toBe(partSlot(START) + 1);
  });
});

describe('pieceTaken (009-2 playtest 3)', () => {
  it('toasts 다른 사람이 먼저 주웠어요; a pick-up given back after its timeout toasts nothing', () => {
    s().receive(snapshot({ parts: 0 }), 0, T);
    s().pieceTaken(20);
    expect(s().feedback.toast).toMatchObject({ kind: 'taken' });
    useStore.setState({ feedback: initialFeedback });
    s().collectPiece(10, T);
    s().dispatchPickup({ type: 'tick', now: 10 + PICKUP_TIMEOUT_MS });
    expect(s().pickup).toEqual(idlePickup);
    expect(s().feedback.toast).toBeNull();
  });
});
