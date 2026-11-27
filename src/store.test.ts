import { beforeEach, describe, expect, it } from 'vitest';
import { GENERATOR, type ServerMessage, type SnapshotMessage } from '../shared/protocol';
import { TOAST_MS, initialFeedback } from './feedback';
import { HOLD_MS, initialRepairUi } from './hold';
import { selectFaulted, selectModuleStatus, setRepairSender, useStore } from './store';
import { initialSync } from './sync';

describe('store.select', () => {
  beforeEach(() => {
    useStore.setState({ selected: GENERATOR, repair: initialRepairUi });
    setRepairSender(null);
  });

  it('cancels a hold in progress when the selection moves away', () => {
    const sent: unknown[] = [];
    setRepairSender((req) => sent.push(req));
    const { dispatchHold, select } = useStore.getState();
    dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    expect(useStore.getState().repair.hold.kind).toBe('holding');

    select(null);
    expect(useStore.getState().repair.hold.kind).toBe('idle');

    // The hold would have completed at 1 s; nothing goes out.
    useStore.getState().dispatchHold({ type: 'tick', now: 2000 });
    expect(sent).toEqual([]);
  });

  it('leaves the hold alone when the same module is selected again', () => {
    const { dispatchHold, select } = useStore.getState();
    dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    select(GENERATOR);
    expect(useStore.getState().repair.hold.kind).toBe('holding');
  });
});

// ---- plan 005: receive, feedback, selectors ----

const F1 = { id: 'f1', moduleId: GENERATOR, createdAt: 1 } as const;

function snapshot(overrides: Partial<SnapshotMessage> = {}): SnapshotMessage {
  return { type: 'snapshot', version: 5, fault: F1, repairs: 2, presence: 2, instanceId: 'inst', ...overrides };
}

function repaired(mine: boolean, version = 6, faultId = 'f1'): ServerMessage {
  return { type: 'repaired', version, faultId, repairs: 3, mine };
}

describe('store.receive', () => {
  beforeEach(() => {
    useStore.setState({
      sync: initialSync,
      selected: null,
      repair: initialRepairUi,
      feedback: initialFeedback,
    });
    setRepairSender(null);
  });

  const s = () => useStore.getState();

  it('applies messages to the synced base', () => {
    s().receive(snapshot(), 0);
    expect(s().sync.base?.fault).toEqual(F1);
    s().receive(repaired(false), 10);
    expect(s().sync.base?.fault).toBeNull();
    expect(s().sync.base?.repairs).toBe(3);
  });

  it('shows my repair: toast, burst effect, and the pending hold ends', () => {
    s().receive(snapshot(), 0);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().dispatchHold({ type: 'tick', now: HOLD_MS });
    expect(s().repair.hold.kind).toBe('pending');

    s().receive(repaired(true), HOLD_MS + 50);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().feedback.toast?.kind).toBe('mine');
    expect(s().feedback.effect).toEqual({ outcome: 'mine', seq: 1, at: HOLD_MS + 50 });
  });

  it('a pending tab that lost the race hears "someone fixed it first"', () => {
    s().receive(snapshot(), 0);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().dispatchHold({ type: 'tick', now: HOLD_MS });

    s().receive(repaired(false), HOLD_MS + 50);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().feedback.toast?.kind).toBe('beaten');
    expect(s().feedback.effect?.outcome).toBe('beaten');
  });

  it('a tab still holding (before sending) is released with "someone fixed it first"', () => {
    s().receive(snapshot(), 0);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });

    s().receive(repaired(false), 400);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().feedback.toast?.kind).toBe('beaten');
  });

  it('an idle tab hears "someone fixed the generator"', () => {
    s().receive(snapshot(), 0);
    s().receive(repaired(false), 400);
    expect(s().feedback.toast?.kind).toBe('other');
    expect(s().feedback.effect?.outcome).toBe('other');
  });

  it('ignores a stale repaired: no toast, no effect', () => {
    s().receive(snapshot({ version: 10 }), 0);
    s().receive(repaired(true, 9), 100);
    expect(s().feedback.toast).toBeNull();
    expect(s().feedback.effect).toBeNull();
    expect(s().sync.base?.fault).toEqual(F1);
  });

  it('reconnecting with a snapshot after sending only syncs state, with no repair effect', () => {
    s().receive(snapshot(), 0);
    s().dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    s().dispatchHold({ type: 'tick', now: HOLD_MS });

    s().receive(snapshot({ version: 6, fault: null, repairs: 3 }), HOLD_MS + 3000);
    expect(s().repair.hold.kind).toBe('idle');
    expect(s().sync.base?.fault).toBeNull();
    expect(s().feedback.effect).toBeNull();
    expect(s().feedback.toast).toBeNull();
  });

  it('toasts a re-fault after the base was healthy, but not a fault already there on arrival', () => {
    s().receive(snapshot(), 0);
    expect(s().feedback.toast).toBeNull();

    s().receive(repaired(false), 100);
    s().dispatchFeedback({ type: 'tick', now: 100 + TOAST_MS });
    expect(s().feedback.toast).toBeNull();

    s().receive({ type: 'fault', version: 7, fault: { ...F1, id: 'f2' } }, 30_000);
    expect(s().feedback.toast?.kind).toBe('refault');
  });

  it('does not toast the first-visit fault right after a healthy first snapshot', () => {
    s().receive(snapshot({ fault: null }), 0);
    s().receive({ type: 'fault', version: 6, fault: F1 }, 5);
    expect(s().feedback.toast).toBeNull();
  });

  it('presence alone changes no feedback', () => {
    s().receive(snapshot(), 0);
    const before = s().feedback;
    s().receive({ type: 'presence', count: 4 }, 10);
    expect(s().feedback).toBe(before);
    expect(s().sync.presence).toBe(4);
  });
});

describe('store.select and the hint', () => {
  beforeEach(() => {
    useStore.setState({ sync: initialSync, selected: null, repair: initialRepairUi, feedback: initialFeedback });
  });

  it('dismisses the hint for good once any module is tapped', () => {
    useStore.getState().select('greenhouse');
    expect(useStore.getState().feedback.hintDismissed).toBe(true);
    useStore.getState().select(null);
    expect(useStore.getState().feedback.hintDismissed).toBe(true);
  });

  it('does not dismiss the hint when the selection is cleared', () => {
    useStore.getState().select(null);
    expect(useStore.getState().feedback.hintDismissed).toBe(false);
  });
});

describe('selectors', () => {
  beforeEach(() => {
    useStore.setState({ sync: initialSync, selected: null, repair: initialRepairUi, feedback: initialFeedback });
  });

  it('reports the fault on the generator only', () => {
    const s = useStore.getState();
    expect(selectFaulted(s)).toBe(false);
    expect(selectModuleStatus(s, 'generator')).toBe('ok');

    s.receive(snapshot(), 0);
    const now = useStore.getState();
    expect(selectFaulted(now)).toBe(true);
    expect(selectModuleStatus(now, 'generator')).toBe('fault');
    expect(selectModuleStatus(now, 'habitat')).toBe('ok');
  });
});
