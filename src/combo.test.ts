import { describe, expect, it } from 'vitest';
import { COMBO_WINDOW_MS, comboLabel, comboSpoken, countsForMe, initialCombo, nextCombo, type Combo } from './combo';
import { classifyRepaired, type RepairOutcome } from './feedback';
import type { HoldState } from './hold';

function run(events: { outcome: RepairOutcome; now: number }[], start: Combo = initialCombo): Combo {
  return events.reduce(nextCombo, start);
}

describe('countsForMe', () => {
  const idle: HoldState = { kind: 'idle' };
  const holding: HoldState = { kind: 'holding', faultId: 'f1', startedAt: 0 };
  const outcome = (hold: HoldState, mine: boolean, helped: boolean) =>
    classifyRepaired(hold, { faultId: 'f1', mine, helped });

  it('my repair and a repair I helped count (008 R7)', () => {
    expect(countsForMe(outcome(idle, true, false))).toBe(true);
    expect(countsForMe(outcome(idle, false, true))).toBe(true);
    expect(countsForMe(outcome(holding, false, true))).toBe(true);
  });

  it('a repair someone else made alone does not, even if I was holding it too late', () => {
    expect(countsForMe(outcome(idle, false, false))).toBe(false);
    expect(countsForMe(outcome(holding, false, false))).toBe(false);
  });
});

describe('nextCombo', () => {
  it('the first repair is 1', () => {
    expect(run([{ outcome: 'mine', now: 1000 }])).toEqual({ count: 1, lastAt: 1000 });
  });

  it('rises while each repair lands within the window of the previous one', () => {
    const s = run([
      { outcome: 'mine', now: 0 },
      { outcome: 'mine', now: 10_000 },
      { outcome: 'mine', now: 10_000 + COMBO_WINDOW_MS },
    ]);
    expect(s).toEqual({ count: 3, lastAt: 10_000 + COMBO_WINDOW_MS });
  });

  it('resets to 1 outside the window', () => {
    const s = run([
      { outcome: 'mine', now: 0 },
      { outcome: 'mine', now: 5000 },
      { outcome: 'mine', now: 5000 + COMBO_WINDOW_MS + 1 },
    ]);
    expect(s).toEqual({ count: 1, lastAt: 5000 + COMBO_WINDOW_MS + 1 });
  });

  it('the window is 15 seconds', () => {
    expect(COMBO_WINDOW_MS).toBe(15_000);
  });

  it('someone else’s repair changes nothing: not the count, not the window', () => {
    const a = run([{ outcome: 'mine', now: 0 }]);
    expect(nextCombo(a, { outcome: 'other', now: 3000 })).toBe(a);
    expect(nextCombo(a, { outcome: 'beaten', now: 3000 })).toBe(a);
    // The window still runs from A, so C at 14 s is x2 and C at 16 s is a new run.
    const afterOther = run([{ outcome: 'other', now: 3000 }], a);
    expect(nextCombo(afterOther, { outcome: 'mine', now: 14_000 }).count).toBe(2);
    expect(nextCombo(afterOther, { outcome: 'mine', now: 16_000 }).count).toBe(1);
    expect(nextCombo(initialCombo, { outcome: 'other', now: 0 })).toBe(initialCombo);
  });

  it('my repair A then a helped repair B is x2, and helped keeps the run going (008 R7)', () => {
    const s = run([
      { outcome: 'mine', now: 0 },
      { outcome: 'helped', now: 8000 },
    ]);
    expect(s).toEqual({ count: 2, lastAt: 8000 });
    expect(nextCombo(s, { outcome: 'mine', now: 20_000 }).count).toBe(3);
  });
});

describe('comboLabel', () => {
  it('shows x2 and up, nothing for a single repair', () => {
    expect(comboLabel(0)).toBeNull();
    expect(comboLabel(1)).toBeNull();
    expect(comboLabel(2)).toBe('x2');
    expect(comboLabel(7)).toBe('x7');
  });
});

describe('comboSpoken', () => {
  it('reads as words, not glued to the +1', () => {
    expect(comboSpoken(2)).toBe('2연속');
    expect(comboSpoken(3)).toBe('3연속');
  });
});
