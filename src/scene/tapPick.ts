/**
 * Which module a tap selects (playtest #47: a tap on the oxygen tank opened the generator). Each
 * module has two invisible boxes: `body` over its model and a larger `margin` for fingers. R3F
 * hands the handler every box under the pointer, nearest first; a margin can stand in front of
 * another module's model, so the nearest body wins and a margin counts only off the models.
 * The parts piece's box beats every module box (009-2 playtest: aiming at the piece selected the
 * building behind it).
 */
import type { BaseModuleId } from '../modules';

export interface TapHit {
  moduleId: BaseModuleId;
  part: 'body' | 'margin';
}

/** The parts piece's finger box. */
export interface PieceHit {
  piece: true;
}

/** `hits` nearest first. The nearest body's module, else the nearest margin's, else null; piece hits are skipped. */
export function pickTap(hits: readonly (TapHit | PieceHit)[]): BaseModuleId | null {
  const modules = hits.filter((h): h is TapHit => 'moduleId' in h);
  return (modules.find((h) => h.part === 'body') ?? modules[0])?.moduleId ?? null;
}

/** A finger this close (CSS px) to the piece on screen means the piece. */
export const PIECE_PICK_PX = 36;
/** For this long after the piece vanished, a tap where it was is about it, not the module behind. */
export const PIECE_GHOST_MS = 2500;

/** Where the piece is on screen against the tap: `live` while it is out, else since when it is gone. */
export interface PieceOnScreen {
  live: boolean;
  distPx: number;
  goneMsAgo: number;
}

/**
 * What a canvas tap means (009-2 playtests). The piece box reaches past the nut, so a ray aimed at a
 * module can graze it, and a piece taken by someone else (or whose slot ended) leaves the module
 * behind under the finger:
 * - `piece`: the piece is out and the finger is on it on screen (within `PIECE_PICK_PX`), or its box
 *   is the nearest thing hit;
 * - `gone`: the piece vanished at most `PIECE_GHOST_MS` ago and the finger is where it was;
 * - otherwise the module pick (`pickTap`), or null.
 */
export function tapTarget(
  hits: readonly (TapHit | PieceHit)[],
  piece: PieceOnScreen | null,
): BaseModuleId | 'piece' | 'gone' | null {
  if (piece?.live) {
    const nearest = hits[0];
    if (piece.distPx <= PIECE_PICK_PX || (nearest !== undefined && 'piece' in nearest)) return 'piece';
  } else if (piece && piece.goneMsAgo <= PIECE_GHOST_MS && piece.distPx <= PIECE_PICK_PX) {
    return 'gone';
  }
  return pickTap(hits);
}
