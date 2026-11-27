import { describe, expect, it } from 'vitest';
import {
  REFAULT_TOAST_MIN_HEALTHY_MS,
  TOAST_MS,
  TOAST_TEXT,
  bottomStack,
  classifyRepaired,
  effectsFor,
  hintVisible,
  initialFeedback,
  reduceFeedback,
  type FeedbackEvent,
  type FeedbackState,
} from './feedback';
import type { HoldState } from './hold';

const idle: HoldState = { kind: 'idle' };
const holding: HoldState = { kind: 'holding', faultId: 'f1', startedAt: 0 };
const pending: HoldState = { kind: 'pending', faultId: 'f1', sentAt: 1000 };

function run(events: FeedbackEvent[], start: FeedbackState = initialFeedback): FeedbackState {
  return events.reduce(reduceFeedback, start);
}

describe('constants and text', () => {
  it('matches the plan', () => {
    expect(TOAST_MS).toBe(3000);
    expect(TOAST_TEXT).toEqual({
      mine: '내가 고쳤어요 +1',
      beaten: '누군가 먼저 고쳤어요',
      other: '누군가 발전기를 고쳤어요',
      refault: '발전기가 다시 고장 났어요',
    });
  });
});

describe('classifyRepaired', () => {
  it('is mine whenever the server says so', () => {
    for (const hold of [idle, holding, pending]) {
      expect(classifyRepaired(hold, { faultId: 'f1', mine: true })).toBe('mine');
    }
  });

  it('is beaten when I was holding or pending on that fault and it was not mine', () => {
    expect(classifyRepaired(holding, { faultId: 'f1', mine: false })).toBe('beaten');
    expect(classifyRepaired(pending, { faultId: 'f1', mine: false })).toBe('beaten');
  });

  it('is other when I was idle, or busy with a different fault', () => {
    expect(classifyRepaired(idle, { faultId: 'f1', mine: false })).toBe('other');
    expect(classifyRepaired(holding, { faultId: 'f2', mine: false })).toBe('other');
    expect(classifyRepaired(pending, { faultId: 'f2', mine: false })).toBe('other');
  });
});

describe('effectsFor', () => {
  it('sweeps on every repair, bursts only on mine, pings only on someone else', () => {
    expect(effectsFor('mine')).toEqual({ sweep: true, burst: true, ringPing: false });
    expect(effectsFor('beaten')).toEqual({ sweep: true, burst: false, ringPing: true });
    expect(effectsFor('other')).toEqual({ sweep: true, burst: false, ringPing: true });
  });
});

describe('reduceFeedback: repaired', () => {
  it('toasts the outcome and records an effect', () => {
    const s = run([{ type: 'repaired', outcome: 'mine', now: 100 }]);
    expect(s.toast).toEqual({ kind: 'mine', until: 100 + TOAST_MS });
    expect(s.effect).toEqual({ outcome: 'mine', seq: 1, at: 100 });
  });

  it('bumps seq on every repair so the scene reacts once per repair', () => {
    const s = run([
      { type: 'repaired', outcome: 'other', now: 100 },
      { type: 'repaired', outcome: 'beaten', now: 200 },
    ]);
    expect(s.effect).toEqual({ outcome: 'beaten', seq: 2, at: 200 });
  });

  it('replaces the current toast with the latest one', () => {
    const s = run([
      { type: 'repaired', outcome: 'other', now: 100 },
      { type: 'repaired', outcome: 'mine', now: 150 },
    ]);
    expect(s.toast).toEqual({ kind: 'mine', until: 150 + TOAST_MS });
  });
});

describe('reduceFeedback: re-fault toast', () => {
  it('toasts when the base breaks after being healthy for a while', () => {
    const s = run([
      { type: 'base', faulted: false, now: 0 },
      { type: 'base', faulted: true, now: REFAULT_TOAST_MIN_HEALTHY_MS },
    ]);
    expect(s.toast).toEqual({ kind: 'refault', until: REFAULT_TOAST_MIN_HEALTHY_MS + TOAST_MS });
    expect(s.healthySince).toBeNull();
  });

  it('does not toast a fault that is already there on arrival', () => {
    const s = run([{ type: 'base', faulted: true, now: 0 }]);
    expect(s.toast).toBeNull();
  });

  it('does not toast the first-visit fault that follows the first snapshot right away', () => {
    const s = run([
      { type: 'base', faulted: false, now: 0 },
      { type: 'base', faulted: true, now: 5 },
    ]);
    expect(s.toast).toBeNull();
  });

  it('toasts only on the healthy-to-faulted edge, not on every faulted message', () => {
    const broken = run([
      { type: 'base', faulted: false, now: 0 },
      { type: 'base', faulted: true, now: 10_000 },
      { type: 'tick', now: 10_000 + TOAST_MS },
    ]);
    expect(broken.toast).toBeNull();
    expect(run([{ type: 'base', faulted: true, now: 20_000 }], broken).toast).toBeNull();
  });

  it('keeps the first healthy time while the base stays healthy', () => {
    const s = run([
      { type: 'base', faulted: false, now: 0 },
      { type: 'base', faulted: false, now: 1500 },
    ]);
    expect(s.healthySince).toBe(0);
  });

  it('toasts again after a repair and another healthy stretch', () => {
    const s = run([
      { type: 'base', faulted: false, now: 0 },
      { type: 'base', faulted: true, now: 10_000 },
      { type: 'repaired', outcome: 'other', now: 11_000 },
      { type: 'base', faulted: false, now: 11_000 },
      { type: 'base', faulted: true, now: 40_000 },
    ]);
    expect(s.toast?.kind).toBe('refault');
  });
});

describe('reduceFeedback: tick', () => {
  it('hides the toast once its time is up', () => {
    const shown = run([{ type: 'repaired', outcome: 'mine', now: 0 }]);
    expect(run([{ type: 'tick', now: TOAST_MS - 1 }], shown).toast).not.toBeNull();
    expect(run([{ type: 'tick', now: TOAST_MS }], shown).toast).toBeNull();
  });

  it('returns the same state when nothing changes', () => {
    expect(reduceFeedback(initialFeedback, { type: 'tick', now: 5 })).toBe(initialFeedback);
  });
});

describe('hint', () => {
  it('shows only while something is broken', () => {
    expect(hintVisible(true, initialFeedback)).toBe(true);
    expect(hintVisible(false, initialFeedback)).toBe(false);
  });

  it('never comes back in this session once a module was tapped', () => {
    const s = run([{ type: 'moduleTapped' }]);
    expect(s.hintDismissed).toBe(true);
    expect(hintVisible(true, s)).toBe(false);
  });
});

describe('bottomStack', () => {
  it('orders panel, then toast, then hint from the bottom edge', () => {
    expect(bottomStack({ panel: true, toast: true, hint: true })).toEqual(['panel', 'toast', 'hint']);
  });

  it('lets the next item take the bottom slot when the one below is hidden', () => {
    expect(bottomStack({ panel: false, toast: true, hint: true })).toEqual(['toast', 'hint']);
    expect(bottomStack({ panel: true, toast: false, hint: true })).toEqual(['panel', 'hint']);
    expect(bottomStack({ panel: false, toast: false, hint: false })).toEqual([]);
  });
});
