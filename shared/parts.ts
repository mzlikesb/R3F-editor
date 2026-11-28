/**
 * Part pieces (plan 009 A.2). A piece falls in every `PART_SLOT_MS` slot of server time; where it
 * lies comes from the slot number alone, so the server stores nothing about pieces and every
 * client sees the same one. Shared by the server (which slot may be collected) and the client
 * (which piece to draw).
 */

/** One slot of server time, one piece. */
export const PART_SLOT_MS = 10_000;
/** The base store holds at most this many parts. */
export const PARTS_CAP = 5;
/**
 * The next slot may be collected this long before it starts (plan 009 R5): a client whose clock
 * offset is a little ahead of the server still gets its tap counted.
 */
export const PART_EARLY_MS = 1_000;
/** Height (world units) a piece floats at. */
export const PART_Y = 0.5;

/**
 * A store count cut to 0..`PARTS_CAP`; null when `v` is not an integer. The client parser and the
 * server's storage read use this one rule, so both read the same count from the same value.
 */
export function clampParts(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  return Math.min(PARTS_CAP, Math.max(0, v));
}

/** The slot that `serverNow` (epoch ms, server clock) falls in. */
export function partSlot(serverNow: number): number {
  return Math.floor(serverNow / PART_SLOT_MS);
}

/**
 * Ground spots (x, z) a piece may land on, in two groups far apart: left of the oxygen tank and in
 * front of the generator. Each is visible and tappable in the portrait phone overview (390x844,
 * 360x780, 320x568): between the HUD band and the bottom UI, off every module's tap box and name
 * tag, not behind a module (plan 009 R1). `src/scene/partSpots.test.ts` checks them against the
 * real camera; change the layout or the overview and that test says which spots to drop.
 */
// prettier-ignore
const SPOTS_LEFT: readonly (readonly [number, number])[] = [
  [-10, -12], [-10, -11], [-10, -10], [-10, -9], [-10, -8], [-9, -12], [-9, -11], [-9, -10], [-9, -9],
  [-9, -8], [-9, -7], [-9, -6], [-9, -5], [-9, -4], [-9, -3], [-8, -11], [-8, -10], [-8, -9], [-8, -8],
  [-8, -7], [-8, -6], [-8, -5], [-8, -4], [-8, -3], [-8, -2], [-8, -1], [-7, -10], [-7, -9], [-7, -8],
  [-7, -7], [-7, -6], [-7, -5], [-7, -4], [-7, -3], [-7, -2], [-7, -1], [-6, -3], [-6, -2], [-6, -1],
  [-5, -2], [-5, -1], [-4, -2], [-4, -1],
];
// prettier-ignore
const SPOTS_FRONT: readonly (readonly [number, number])[] = [
  [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [2, 5], [2, 6], [2, 7],
];

/** Every spot, both groups. */
export const PART_SPOTS: readonly (readonly [number, number])[] = [...SPOTS_LEFT, ...SPOTS_FRONT];

/** 32-bit integer hash (lowbias32). Deterministic on every engine. */
function hash(n: number): number {
  let x = n >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Where the piece of `slot` lies. Even slots land in one group and odd slots in the other, so two
 * pieces in a row are always far apart; the spot within the group is a hash of the slot.
 */
export function partPosition(slot: number): { x: number; y: number; z: number } {
  const group = slot % 2 === 0 ? SPOTS_LEFT : SPOTS_FRONT;
  const [x, z] = group[hash(slot) % group.length]!;
  return { x, y: PART_Y, z };
}
