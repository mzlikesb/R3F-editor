import { describe, expect, it } from 'vitest';
import {
  HOLD_MS,
  NOTICE_MS,
  PENDING_TIMEOUT_MS,
  holdProgress,
  initialRepairUi,
  reduceHold,
  type HoldEvent,
  type RepairUi,
} from './hold';

/** Runs events in order; returns the final ui and every request that was sent. */
function run(events: HoldEvent[], start: RepairUi = initialRepairUi) {
  let ui = start;
  const sent: string[] = [];
  for (const e of events) {
    const r = reduceHold(ui, e);
    ui = r.ui;
    if (r.send) sent.push(r.send.faultId);
  }
  return { ui, sent };
}

const press = (now = 0): HoldEvent => ({ type: 'press', faultId: 'f1', now });
const tick = (now: number): HoldEvent => ({ type: 'tick', now });
/** Pressed at 0 and held past HOLD_MS: request sent, now pending. */
const toPending = [press(0), tick(HOLD_MS)];

describe('timing constants', () => {
  it('matches the plan', () => {
    expect(HOLD_MS).toBe(1000);
    expect(PENDING_TIMEOUT_MS).toBe(5000);
    expect(NOTICE_MS).toBe(3000);
  });
});

describe('holding', () => {
  it('starts holding on press, without sending', () => {
    const { ui, sent } = run([press(0)]);
    expect(ui.hold.kind).toBe('holding');
    expect(sent).toEqual([]);
  });

  it('does not send before 1 second', () => {
    const { ui, sent } = run([press(0), tick(HOLD_MS - 1)]);
    expect(ui.hold.kind).toBe('holding');
    expect(sent).toEqual([]);
  });

  it('sends one repair for the held fault after 1 second and waits', () => {
    const { ui, sent } = run([...toPending, tick(HOLD_MS + 16), tick(HOLD_MS + 32)]);
    expect(ui.hold.kind).toBe('pending');
    expect(sent).toEqual(['f1']);
  });

  it('cancels silently when released early', () => {
    const { ui, sent } = run([press(0), { type: 'release', now: 500 }, tick(HOLD_MS + 100)]);
    expect(ui).toEqual(initialRepairUi);
    expect(sent).toEqual([]);
  });

  it('cancels silently when the pointer leaves, the tab hides, or the pointer is cancelled', () => {
    const { ui, sent } = run([press(0), { type: 'cancel', now: 400 }, tick(HOLD_MS + 100)]);
    expect(ui).toEqual(initialRepairUi);
    expect(sent).toEqual([]);
  });

  it('cancels silently when the connection drops', () => {
    const { ui, sent } = run([press(0), { type: 'disconnect', now: 400 }, tick(HOLD_MS + 100)]);
    expect(ui).toEqual(initialRepairUi);
    expect(sent).toEqual([]);
  });

  it('releases with "someone fixed it first" when the fault is repaired mid-hold', () => {
    const { ui, sent } = run([press(0), { type: 'repaired', faultId: 'f1', now: 600 }, tick(HOLD_MS + 100)]);
    expect(ui.hold.kind).toBe('idle');
    expect(ui.notice?.kind).toBe('beaten');
    expect(sent).toEqual([]);
  });

  it('hides "someone fixed it first" after 3 seconds', () => {
    const beaten = [press(0), { type: 'repaired', faultId: 'f1', now: 600 } as HoldEvent];
    expect(run([...beaten, tick(600 + NOTICE_MS - 1)]).ui.notice?.kind).toBe('beaten');
    expect(run([...beaten, tick(600 + NOTICE_MS)]).ui.notice).toBeNull();
  });
});

describe('pending', () => {
  it('succeeds when my fault comes back repaired', () => {
    const { ui } = run([...toPending, { type: 'repaired', faultId: 'f1', now: 1200 }]);
    expect(ui.hold.kind).toBe('idle');
    expect(ui.notice?.kind).toBe('success');
  });

  it('stays pending after release or cancel (the request is already out)', () => {
    expect(run([...toPending, { type: 'release', now: 1100 }]).ui.hold.kind).toBe('pending');
    expect(run([...toPending, { type: 'cancel', now: 1100 }]).ui.hold.kind).toBe('pending');
  });

  it('goes back to idle after 5 seconds without an answer', () => {
    expect(run([...toPending, tick(HOLD_MS + PENDING_TIMEOUT_MS - 1)]).ui.hold.kind).toBe('pending');
    const { ui } = run([...toPending, tick(HOLD_MS + PENDING_TIMEOUT_MS)]);
    expect(ui.hold.kind).toBe('idle');
    expect(ui.notice).toBeNull();
  });

  it('goes back to idle on a new snapshot (the new state is the answer)', () => {
    const { ui } = run([...toPending, { type: 'snapshot', now: 2000 }]);
    expect(ui.hold.kind).toBe('idle');
    expect(ui.notice).toBeNull();
  });

  it('does not send again while pending', () => {
    const { sent } = run([...toPending, press(1100), tick(2500)]);
    expect(sent).toEqual(['f1']);
  });
});

describe('idle', () => {
  it('shows nothing when someone else repairs while I am not holding', () => {
    const { ui } = run([{ type: 'repaired', faultId: 'f1', now: 100 }]);
    expect(ui).toEqual(initialRepairUi);
  });

  it('can hold again after a cancelled hold', () => {
    const { ui, sent } = run([press(0), { type: 'cancel', now: 100 }, press(200), tick(200 + HOLD_MS)]);
    expect(ui.hold.kind).toBe('pending');
    expect(sent).toEqual(['f1']);
  });
});

describe('holdProgress', () => {
  it('fills from 0 to 1 over the hold, stays full while pending, empty when idle', () => {
    expect(holdProgress({ kind: 'idle' }, 500)).toBe(0);
    expect(holdProgress({ kind: 'holding', faultId: 'f1', startedAt: 0 }, 0)).toBe(0);
    expect(holdProgress({ kind: 'holding', faultId: 'f1', startedAt: 0 }, HOLD_MS / 2)).toBeCloseTo(0.5);
    expect(holdProgress({ kind: 'holding', faultId: 'f1', startedAt: 0 }, HOLD_MS * 2)).toBe(1);
    expect(holdProgress({ kind: 'pending', faultId: 'f1', sentAt: 0 }, 100)).toBe(1);
  });
});
