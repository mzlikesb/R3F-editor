/**
 * The modules standing in the base (plan 006: every one of them can break). Owned by the dev lead;
 * all three tracks of `docs/plans/006-tasks.md` read it.
 */
import { MODULE_IDS, type ModuleId } from '../shared/protocol';

/** Same set as the server's `ModuleId` from plan 006 on. Kept as an alias so scene code reads as before. */
export type BaseModuleId = ModuleId;

export interface BaseModuleInfo {
  id: BaseModuleId;
  /** Shown on name tags, badges, toasts and the panel. */
  name: string;
}

const NAMES: Record<ModuleId, string> = {
  generator: '발전기',
  oxygen: '산소 탱크',
  greenhouse: '온실',
  comms: '통신탑',
  habitat: '거주 돔',
};

/** Generator first (center of the base), then the ring around it (`MODULE_IDS` order). */
export const MODULES: readonly BaseModuleInfo[] = MODULE_IDS.map((id) => ({ id, name: NAMES[id] }));

export function moduleName(id: BaseModuleId): string {
  return NAMES[id];
}

/** True when the last syllable of `word` has a final consonant (받침). Non-Hangul endings count as none. */
export function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** `발전기를`, `온실을`. */
export function withObjectParticle(word: string): string {
  return `${word}${hasFinalConsonant(word) ? '을' : '를'}`;
}

/** `발전기가`, `온실이`. */
export function withSubjectParticle(word: string): string {
  return `${word}${hasFinalConsonant(word) ? '이' : '가'}`;
}
