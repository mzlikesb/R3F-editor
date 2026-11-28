import { describe, expect, it } from 'vitest';
import { PARTS_CAP, PART_SLOT_MS } from '../shared/parts';
import {
  BLINK_MS,
  PICKUP_TIMEOUT_MS,
  blinkOn,
  idlePickup,
  initialPing,
  msToNextSlot,
  pieceOut,
  pieceShown,
  reducePickup,
  reducePing,
  type Pickup,
} from './parts';

const SLOT = 180_000_000;
const START = SLOT * PART_SLOT_MS;
const pending = (slot = SLOT, sentAt = 100): Pickup => ({ kind: 'pending', slot, sentAt });

describe('pieceOut (B.1)', () => {
  it('a piece is out while the store has room and its slot is past the last one collected', () => {
    expect(pieceOut({ parts: 0, lastPartSlot: -1 }, SLOT)).toBe(true);
    expect(pieceOut({ parts: PARTS_CAP - 1, lastPartSlot: SLOT - 1 }, SLOT)).toBe(true);
  });

  it('not once this slot was collected, not at the cap, not before the base is known', () => {
    expect(pieceOut({ parts: 1, lastPartSlot: SLOT }, SLOT)).toBe(false);
    expect(pieceOut({ parts: PARTS_CAP, lastPartSlot: -1 }, SLOT)).toBe(false);
    expect(pieceOut(null, SLOT)).toBe(false);
  });
});

describe('pieceShown', () => {
  const base = { parts: 0, lastPartSlot: -1 };

  it('hides the piece this tab just picked up while it waits for the server', () => {
    expect(pieceShown(base, SLOT, idlePickup)).toBe(true);
    expect(pieceShown(base, SLOT, pending())).toBe(false);
  });

  it('a pick-up of an older slot does not hide the new piece', () => {
    expect(pieceShown(base, SLOT + 1, pending(SLOT))).toBe(true);
  });
});

describe('slot clock (server time)', () => {
  it('counts down to the next slot', () => {
    expect(msToNextSlot(START)).toBe(PART_SLOT_MS);
    expect(msToNextSlot(START + 2500)).toBe(PART_SLOT_MS - 2500);
    expect(msToNextSlot(START + PART_SLOT_MS - 1)).toBe(1);
  });

  it(`blinks only in the last ${BLINK_MS} ms of a slot`, () => {
    for (let t = 0; t < PART_SLOT_MS - BLINK_MS; t += 250) expect(blinkOn(START + t)).toBe(true);
    const tail = Array.from({ length: 16 }, (_, i) => blinkOn(START + PART_SLOT_MS - BLINK_MS + i * 125));
    expect(tail).toContain(false);
    expect(tail).toContain(true);
  });
});

describe('reducePickup (B.2, R5)', () => {
  it('a tap sends collect for that slot and waits', () => {
    expect(reducePickup(idlePickup, { type: 'tap', slot: SLOT, now: 100, allowed: true })).toEqual({
      pickup: pending(),
      send: { type: 'collect', slot: SLOT },
    });
  });

  it('ignores a tap while disconnected, or while one is already waiting', () => {
    expect(reducePickup(idlePickup, { type: 'tap', slot: SLOT, now: 0, allowed: false })).toEqual({
      pickup: idlePickup,
      send: null,
    });
    const p = pending();
    expect(reducePickup(p, { type: 'tap', slot: SLOT, now: 200, allowed: true })).toEqual({ pickup: p, send: null });
  });

  it('ends on the parts message of its slot, mine or not (someone else got there first)', () => {
    for (const mine of [true, false]) {
      expect(reducePickup(pending(), { type: 'parts', slot: SLOT, count: 1, mine }).pickup).toEqual(idlePickup);
    }
  });

  it('ends at once when the store reaches the cap', () => {
    const r = reducePickup(pending(), { type: 'parts', slot: SLOT - 1, count: PARTS_CAP, mine: false });
    expect(r.pickup).toEqual(idlePickup);
  });

  it('keeps waiting on a parts message of an older slot below the cap', () => {
    const p = pending();
    expect(reducePickup(p, { type: 'parts', slot: SLOT - 1, count: 2, mine: false }).pickup).toBe(p);
  });

  it('ends on a reconnect snapshot and on a disconnect', () => {
    expect(reducePickup(pending(), { type: 'snapshot' }).pickup).toEqual(idlePickup);
    expect(reducePickup(pending(), { type: 'disconnect' }).pickup).toEqual(idlePickup);
  });

  it(`gives the piece back after ${PICKUP_TIMEOUT_MS} ms without an answer`, () => {
    const p = pending(SLOT, 100);
    expect(reducePickup(p, { type: 'tick', now: 100 + PICKUP_TIMEOUT_MS - 1 }).pickup).toBe(p);
    expect(reducePickup(p, { type: 'tick', now: 100 + PICKUP_TIMEOUT_MS }).pickup).toEqual(idlePickup);
  });

  it('an idle pick-up stays the same object', () => {
    expect(reducePickup(idlePickup, { type: 'tick', now: 1e9 }).pickup).toBe(idlePickup);
    expect(reducePickup(idlePickup, { type: 'snapshot' }).pickup).toBe(idlePickup);
  });
});

describe('reducePing (B.4, R5)', () => {
  it('pings the piece at once when it is out', () => {
    expect(reducePing(initialPing, { type: 'request', slot: SLOT, out: true })).toEqual({
      seq: 1,
      slot: SLOT,
      waitFor: null,
    });
  });

  it('with no piece this slot, waits for the next one and pings it when it falls', () => {
    const waiting = reducePing(initialPing, { type: 'request', slot: SLOT, out: false });
    expect(waiting).toEqual({ ...initialPing, waitFor: SLOT + 1 });
    expect(reducePing(waiting, { type: 'slot', slot: SLOT, out: false })).toBe(waiting);
    expect(reducePing(waiting, { type: 'slot', slot: SLOT + 1, out: true })).toEqual({
      seq: 1,
      slot: SLOT + 1,
      waitFor: null,
    });
  });

  it('a slot that came with no piece out moves the wait on to the next one', () => {
    const waiting = reducePing(initialPing, { type: 'request', slot: SLOT, out: false });
    expect(reducePing(waiting, { type: 'slot', slot: SLOT + 1, out: false }).waitFor).toBe(SLOT + 2);
  });

  it('cancel drops the wait (store filled, or a module selected) and keeps the last ping', () => {
    const fired = reducePing(initialPing, { type: 'request', slot: SLOT, out: true });
    const waiting = reducePing(fired, { type: 'request', slot: SLOT + 1, out: false });
    expect(reducePing(waiting, { type: 'cancel' })).toEqual(fired);
    expect(reducePing(fired, { type: 'cancel' })).toBe(fired);
  });
});
