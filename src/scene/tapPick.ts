/**
 * Which module a tap selects (playtest #47: a tap on the oxygen tank opened the generator). Each
 * module has two invisible boxes: `body` over its model and a larger `margin` for fingers. R3F
 * hands the handler every box under the pointer, nearest first; a margin can stand in front of
 * another module's model, so the nearest body wins and a margin counts only off the models.
 */
import type { BaseModuleId } from '../modules';

export interface TapHit {
  moduleId: BaseModuleId;
  part: 'body' | 'margin';
}

/** `hits` nearest first. The nearest body's module, else the nearest margin's, else null. */
export function pickTap(hits: readonly TapHit[]): BaseModuleId | null {
  return (hits.find((h) => h.part === 'body') ?? hits[0])?.moduleId ?? null;
}
