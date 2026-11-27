import { describe, expect, it } from 'vitest';
import type { ClientMessage } from '../shared/protocol';
import {
  HOLD_MS,
  PENDING_TIMEOUT_MS,
  holdProgress,
  initialRepairUi,
  reduceHold,
  type HoldEvent,
  type RepairUi,
} from './hold';

/** Runs events in order; returns the final ui and every message that was sent. */
function run(events: HoldEvent[], start: RepairUi = initialRepairUi) {
  let ui = start;
  const sent: ClientMessage[] = [];
  for (const e of events) {
    const r = reduceHold(ui, e);
    ui = r.ui;
    if (r.send) sent.push(r.send);
  }
  return { ui, sent };
}

const press = (now = 0, faultId = 'f1'): HoldEvent => ({ type: 'press', faultId, now });
const tick = (now: number): HoldEvent => ({ type: 'tick', now });
const toPending = [press(0), tick(HOLD_MS)];
const hold = { type: 'hold', faultId: 'f1' } as const;
const release = { type: 'release', faultId: 'f1' } as const;
const repair = { type: 'repair', faultId: 'f1' } as const;

describe('timing constants', () => {
  it('matches the plan', () => {
    expect(HOLD_MS).toBe(1000);
    expect(PENDING_TIMEOUT_MS).toBe(5000);
  });
});

describe('holding', () => {
  it('tells the server a hold started', () => {
    const { ui, sent } = run([press(0)]);
    expect(ui.hold).toEqual({ kind: 'holding', faultId: 'f1', startedAt: 0 });
    expect(sent).toEqual([hold]);
  });

  it('sends one repair after 1 second and waits', () => {
    expect(run([press(0), tick(HOLD_MS - 1)]).sent).toEqual([hold]);
    const { ui, sent } = run([...toPending, tick(HOLD_MS + 16), tick(HOLD_MS + 32)]);
    expect(ui.hold.kind).toBe('pending');
    expect(sent).toEqual([hold, repair]);
  });

  it('sends release when let go early or cancelled', () => {
    for (const type of ['release', 'cancel'] as const) {
      const { ui, sent } = run([press(0), { type, now: 400 }, tick(HOLD_MS + 100)]);
      expect(ui).toEqual(initialRepairUi);
      expect(sent).toEqual([hold, release]);
    }
  });

  it('ends quietly when the connection drops', () => {
    const { ui, sent } = run([press(0), { type: 'disconnect', now: 400 }, tick(HOLD_MS + 100)]);
    expect(ui).toEqual(initialRepairUi);
    expect(sent).toEqual([hold]);
  });

  it('ends without a release when the held fault is repaired (the server cleared the holds)', () => {
    const { ui, sent } = run([press(0), { type: 'repaired', faultId: 'f1', now: 600 }, tick(HOLD_MS + 100)]);
    expect(ui).toEqual(initialRepairUi);
    expect(sent).toEqual([hold]);
  });

  it('keeps holding when a different fault is repaired', () => {
    expect(run([press(0), { type: 'repaired', faultId: 'other', now: 600 }]).ui.hold.kind).toBe('holding');
  });

  it('#15-4: cancels and releases when the held fault disappears (its button is gone)', () => {
    const { ui, sent } = run([press(0), { type: 'faults', ids: ['f2'], now: 300 }, tick(HOLD_MS + 100)]);
    expect(ui).toEqual(initialRepairUi);
    expect(sent).toEqual([hold, release]);
  });

  it('keeps holding while the held fault is still there', () => {
    const before = run([press(0)]).ui;
    const r = reduceHold(before, { type: 'faults', ids: ['f1', 'f2'], now: 300 });
    expect(r.ui).toBe(before);
    expect(r.send).toBeNull();
  });
});

describe('pending', () => {
  it('goes back to idle when the pending fault comes back repaired', () => {
    expect(run([...toPending, { type: 'repaired', faultId: 'f1', now: 1200 }]).ui).toEqual(initialRepairUi);
  });

  it('stays pending after release or cancel, sending nothing more', () => {
    for (const type of ['release', 'cancel'] as const) {
      const { ui, sent } = run([...toPending, { type, now: 1100 }]);
      expect(ui.hold.kind).toBe('pending');
      expect(sent).toEqual([hold, repair]);
    }
  });

  it('goes back to idle after 5 seconds without an answer, on a new snapshot, or when the fault is gone', () => {
    expect(run([...toPending, tick(HOLD_MS + PENDING_TIMEOUT_MS - 1)]).ui.hold.kind).toBe('pending');
    expect(run([...toPending, tick(HOLD_MS + PENDING_TIMEOUT_MS)]).ui).toEqual(initialRepairUi);
    expect(run([...toPending, { type: 'snapshot', now: 2000 }]).ui).toEqual(initialRepairUi);
    const gone = run([...toPending, { type: 'faults', ids: [], now: 1500 }]);
    expect(gone.ui).toEqual(initialRepairUi);
    expect(gone.sent).toEqual([hold, repair]);
  });

  it('does not send again while pending', () => {
    expect(run([...toPending, press(1100), tick(2500)]).sent).toEqual([hold, repair]);
  });
});

describe('idle', () => {
  it('returns the same ui and sends nothing for events that do not apply', () => {
    for (const e of [
      { type: 'release', now: 1 },
      { type: 'cancel', now: 1 },
      { type: 'repaired', faultId: 'f1', now: 1 },
      { type: 'faults', ids: [], now: 1 },
      tick(5000),
    ] as HoldEvent[]) {
      const r = reduceHold(initialRepairUi, e);
      expect(r.ui).toBe(initialRepairUi);
      expect(r.send).toBeNull();
    }
  });
});

describe('holdProgress', () => {
  it('fills from 0 to 1 over the hold, stays full while pending, empty when idle', () => {
    expect(holdProgress({ kind: 'idle' }, 500)).toBe(0);
    expect(holdProgress({ kind: 'holding', faultId: 'f1', startedAt: 0 }, HOLD_MS / 2)).toBeCloseTo(0.5);
    expect(holdProgress({ kind: 'holding', faultId: 'f1', startedAt: 0 }, HOLD_MS * 2)).toBe(1);
    expect(holdProgress({ kind: 'pending', faultId: 'f1', sentAt: 0 }, 100)).toBe(1);
  });
});
