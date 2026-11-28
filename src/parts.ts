/**
 * The parts piece on the client (plan 009 B): whether it is out, picking it up, and the ring ping
 * that points at it. Pure; the store keeps the state and the scene draws from it. Times named
 * `serverNow` are server epoch ms (`selectServerNow`); `now` is `performance.now()`.
 */
import { PARTS_CAP, PART_SLOT_MS, partSlot } from '../shared/parts';
import type { CollectRequest } from '../shared/protocol';

/** A pick-up with no answer by then is given back (an ignored `collect`: slot edge, rate limit). */
export const PICKUP_TIMEOUT_MS = 1500;
/** The piece blinks this long before its slot ends. */
export const BLINK_MS = 2000;
/** One blink, on or off. */
const BLINK_HALF_MS = 125;

/** What the client mirrors of the store. */
export interface PartsView {
  parts: number;
  lastPartSlot: number;
}

/** The piece of `slot` is out: the store has room and nobody collected it yet (B.1). */
export function pieceOut(base: PartsView | null, slot: number): boolean {
  return base !== null && base.parts < PARTS_CAP && slot > base.lastPartSlot;
}

export type Pickup = { kind: 'idle' } | { kind: 'pending'; slot: number; sentAt: number };

export const idlePickup: Pickup = { kind: 'idle' };

/** The piece to draw: out, and not the one this tab just picked up (it is on its way to the store). */
export function pieceShown(base: PartsView | null, slot: number, pickup: Pickup): boolean {
  return pieceOut(base, slot) && !(pickup.kind === 'pending' && pickup.slot === slot);
}

/** Ms until the next slot starts. */
export function msToNextSlot(serverNow: number): number {
  return (partSlot(serverNow) + 1) * PART_SLOT_MS - serverNow;
}

/** False in the off half of a blink; the piece blinks only in the last `BLINK_MS` of its slot. */
export function blinkOn(serverNow: number): boolean {
  const left = msToNextSlot(serverNow);
  return left > BLINK_MS || Math.floor(left / BLINK_HALF_MS) % 2 === 0;
}

export type PickupEvent =
  /** The piece of `slot` was tapped; `allowed` when the socket is open and the protocol readable. */
  | { type: 'tap'; slot: number; now: number; allowed: boolean }
  /** A `parts` message arrived. */
  | { type: 'parts'; slot: number; count: number; mine: boolean }
  /** A WS snapshot arrived (a reconnect). */
  | { type: 'snapshot' }
  | { type: 'disconnect' }
  | { type: 'tick'; now: number };

export interface PickupResult {
  pickup: Pickup;
  send: CollectRequest | null;
}

/**
 * - `tap` (idle, allowed): pending on that slot, send `collect`.
 * - `parts` of the pending slot or a later one (mine or someone else's), or the store at the cap:
 *   idle at once (R5). `snapshot`, `disconnect`: idle.
 * - `tick` `PICKUP_TIMEOUT_MS` after the tap: idle, so the piece shows again.
 * Everything else keeps `pickup` itself.
 */
export function reducePickup(pickup: Pickup, event: PickupEvent): PickupResult {
  const keep: PickupResult = { pickup, send: null };
  const idle: PickupResult = { pickup: idlePickup, send: null };
  if (event.type === 'tap') {
    if (pickup.kind !== 'idle' || !event.allowed) return keep;
    return {
      pickup: { kind: 'pending', slot: event.slot, sentAt: event.now },
      send: { type: 'collect', slot: event.slot },
    };
  }
  if (pickup.kind === 'idle') return keep;
  switch (event.type) {
    case 'parts':
      return event.slot >= pickup.slot || event.count >= PARTS_CAP ? idle : keep;
    case 'snapshot':
    case 'disconnect':
      return idle;
    case 'tick':
      return event.now - pickup.sentAt >= PICKUP_TIMEOUT_MS ? idle : keep;
  }
}

/** The ring ping on the piece: `seq` goes up per ping (the scene plays it once), at `slot`'s spot. */
export interface PartPing {
  seq: number;
  slot: number;
  /** A ping waiting for the piece of this slot to fall; null for none. */
  waitFor: number | null;
}

export const initialPing: PartPing = { seq: 0, slot: -1, waitFor: null };

export type PingEvent =
  /** `부품을 먼저 주워요` / `다음 조각 N초` was pressed. `out`: the piece of `slot` is out. */
  | { type: 'request'; slot: number; out: boolean }
  /** The clock reached `slot` (a timer); `out` as above. */
  | { type: 'slot'; slot: number; out: boolean }
  /** The store got a part, or a module was selected. */
  | { type: 'cancel' };

/**
 * - `request`: a piece out is pinged now; otherwise the ping waits for the next slot.
 * - `slot` at or past the one waited for: pings it if out, else waits for the one after.
 * - `cancel`: drops the wait.
 * Returns `ping` itself when nothing changes.
 */
export function reducePing(ping: PartPing, event: PingEvent): PartPing {
  switch (event.type) {
    case 'request':
      return event.out ? { seq: ping.seq + 1, slot: event.slot, waitFor: null } : { ...ping, waitFor: event.slot + 1 };
    case 'slot':
      if (ping.waitFor === null || event.slot < ping.waitFor) return ping;
      return event.out ? { seq: ping.seq + 1, slot: event.slot, waitFor: null } : { ...ping, waitFor: event.slot + 1 };
    case 'cancel':
      return ping.waitFor === null ? ping : { ...ping, waitFor: null };
  }
}

/** The HUD chip's reaction to a store change: `seq` up per change, `delta` +1 or -1, `mine` for my own pick-up. */
export interface ChipFx {
  seq: number;
  delta: 1 | -1;
  mine: boolean;
}

export const initialChipFx: ChipFx = { seq: 0, delta: 1, mine: false };

/** A picked-up piece flying from where it was tapped (CSS px) to the HUD chip; `seq` up per tap. */
export interface Flight {
  seq: number;
  x: number;
  y: number;
}

export const initialFlight: Flight = { seq: 0, x: 0, y: 0 };

/**
 * Why the piece of `slot` stopped being out: `mine` (my pick-up of it is on its way), `other`
 * (the store says that slot was collected, not by this tab), else `slot` (its slot ended or the
 * store filled).
 */
export function vanishReason(pickup: Pickup, slot: number, base: PartsView | null): 'mine' | 'other' | 'slot' {
  if (pickup.kind === 'pending' && pickup.slot === slot) return 'mine';
  if (base !== null && base.lastPartSlot >= slot) return 'other';
  return 'slot';
}
