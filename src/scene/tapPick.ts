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

/** `hits` nearest first. `piece` if the piece is among them, else the nearest body's module, else the nearest margin's, else null. */
export function pickTap(hits: readonly TapHit[]): BaseModuleId | null;
export function pickTap(hits: readonly (TapHit | PieceHit)[]): BaseModuleId | 'piece' | null;
export function pickTap(hits: readonly (TapHit | PieceHit)[]): BaseModuleId | 'piece' | null {
  if (hits.some((h) => 'piece' in h)) return 'piece';
  const modules = hits.filter((h): h is TapHit => 'moduleId' in h);
  return (modules.find((h) => h.part === 'body') ?? modules[0])?.moduleId ?? null;
}
