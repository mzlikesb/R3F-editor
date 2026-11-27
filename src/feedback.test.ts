import { describe, expect, it } from 'vitest';
import {
  TOAST_MS,
  bottomStack,
  classifyRepaired,
  AFTERGLOW_MS,
  effectsFor,
  hintVisible,
  initialFeedback,
  reduceFeedback,
  toastText,
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

describe('toastText', () => {
  it('names the module with the right particle', () => {
    expect(toastText({ kind: 'mine', moduleId: 'oxygen' })).toBe('내가 고쳤어요 +1');
    expect(toastText({ kind: 'helped', moduleId: 'oxygen' })).toBe('함께 고쳤어요 +1');
    expect(toastText({ kind: 'beaten', moduleId: 'oxygen' })).toBe('같이 눌렀는데 다른 사람이 한발 먼저 고쳤어요');
    expect(toastText({ kind: 'other', moduleId: 'generator' })).toBe('누군가 발전기를 고쳤어요');
    expect(toastText({ kind: 'other', moduleId: 'greenhouse' })).toBe('누군가 온실을 고쳤어요');
    expect(toastText({ kind: 'fault', moduleId: 'oxygen' })).toBe('산소 탱크가 고장 났어요');
    expect(toastText({ kind: 'fault', moduleId: 'comms' })).toBe('통신탑이 고장 났어요');
  });
});

describe('classifyRepaired', () => {
  const msg = (mine: boolean, helped = false, faultId = 'f1') => ({ faultId, mine, helped });

  it('is mine whenever the server says so', () => {
    for (const hold of [idle, holding, pending]) {
      expect(classifyRepaired(hold, msg(true))).toBe('mine');
    }
  });

  it('is helped whenever the server says I was holding it (#56), whatever this tab thinks', () => {
    for (const hold of [idle, holding, pending]) {
      expect(classifyRepaired(hold, msg(false, true))).toBe('helped');
    }
  });

  it('is beaten when I was holding or pending on that fault, other otherwise', () => {
    expect(classifyRepaired(holding, msg(false))).toBe('beaten');
    expect(classifyRepaired(pending, msg(false))).toBe('beaten');
    expect(classifyRepaired(idle, msg(false))).toBe('other');
    expect(classifyRepaired(holding, msg(false, false, 'f2'))).toBe('other');
  });
});

describe('effectsFor', () => {
  it('sweeps on every repair, bursts only on mine, pings and glows only on someone else', () => {
    expect(effectsFor('mine')).toEqual({ sweep: true, burst: true, soft: false, ringPing: false, afterglow: false });
    expect(effectsFor('beaten')).toEqual({ sweep: true, burst: false, soft: false, ringPing: true, afterglow: true });
    expect(effectsFor('other')).toEqual({ sweep: true, burst: false, soft: false, ringPing: true, afterglow: true });
  });

  it('helped bursts softly: no flash, a smaller punch and fewer sparks (#56)', () => {
    expect(effectsFor('helped')).toEqual({ sweep: true, burst: true, soft: true, ringPing: false, afterglow: false });
  });

  it('the afterglow lasts three seconds (playtest #47: someone else was here)', () => {
    expect(AFTERGLOW_MS).toBe(3000);
  });
});

describe('reduceFeedback', () => {
  it('a repair toasts and records an effect on that module', () => {
    const s = run([{ type: 'repaired', outcome: 'mine', moduleId: 'comms', now: 100 }]);
    expect(s.toast).toEqual({ kind: 'mine', moduleId: 'comms', until: 100 + TOAST_MS });
    expect(s.effect).toEqual({ outcome: 'mine', moduleId: 'comms', seq: 1, at: 100 });
  });

  it('bumps seq on every repair, latest toast wins', () => {
    const s = run([
      { type: 'repaired', outcome: 'other', moduleId: 'oxygen', now: 100 },
      { type: 'repaired', outcome: 'beaten', moduleId: 'habitat', now: 200 },
    ]);
    expect(s.effect).toEqual({ outcome: 'beaten', moduleId: 'habitat', seq: 2, at: 200 });
    expect(s.toast?.kind).toBe('beaten');
  });

  it('a new fault toasts with its module and leaves the effect alone', () => {
    const repairedOnce = run([{ type: 'repaired', outcome: 'other', moduleId: 'oxygen', now: 100 }]);
    const s = run([{ type: 'fault', moduleId: 'greenhouse', now: 500 }], repairedOnce);
    expect(s.toast).toEqual({ kind: 'fault', moduleId: 'greenhouse', until: 500 + TOAST_MS });
    expect(s.effect).toBe(repairedOnce.effect);
  });

  it('hides the toast once its time is up, and returns the same state otherwise', () => {
    const shown = run([{ type: 'fault', moduleId: 'oxygen', now: 0 }]);
    expect(run([{ type: 'tick', now: TOAST_MS - 1 }], shown)).toBe(shown);
    expect(run([{ type: 'tick', now: TOAST_MS }], shown).toast).toBeNull();
    expect(reduceFeedback(initialFeedback, { type: 'tick', now: 5 })).toBe(initialFeedback);
  });

  it('dismisses the hint for good on the first tap', () => {
    const s = run([{ type: 'moduleTapped' }]);
    expect(s.hintDismissed).toBe(true);
    expect(reduceFeedback(s, { type: 'moduleTapped' })).toBe(s);
  });
});

describe('hint', () => {
  it('shows only after loading, while something is broken, until a tap', () => {
    expect(hintVisible(true, initialFeedback, true)).toBe(true);
    expect(hintVisible(false, initialFeedback, true)).toBe(false);
    expect(hintVisible(true, initialFeedback, false)).toBe(false);
    expect(hintVisible(true, { ...initialFeedback, hintDismissed: true }, true)).toBe(false);
  });
});

describe('bottomStack', () => {
  it('orders panel, then toast, then hint from the bottom edge', () => {
    expect(bottomStack({ panel: true, toast: true, hint: true })).toEqual(['panel', 'toast', 'hint']);
    expect(bottomStack({ panel: false, toast: true, hint: true })).toEqual(['toast', 'hint']);
    expect(bottomStack({ panel: false, toast: false, hint: false })).toEqual([]);
  });
});
