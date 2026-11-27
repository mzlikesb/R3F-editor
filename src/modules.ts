/**
 * The modules standing in the base (plan 005 A.3). Client-only: the server still knows only the
 * generator (`shared/protocol.ts` `ModuleId`); the rest are healthy background modules until M3.
 * Owned by the dev lead; all three tracks of `docs/plans/005-tasks.md` read it.
 */
import { GENERATOR, type ModuleId } from '../shared/protocol';

export type BaseModuleId = ModuleId | 'oxygen' | 'greenhouse' | 'comms' | 'habitat';

export interface BaseModuleInfo {
  id: BaseModuleId;
  /** Shown on name tags, badges, toasts and the panel. */
  name: string;
}

/** Generator first (center of the base), then the ring around it. */
export const MODULES: readonly BaseModuleInfo[] = [
  { id: GENERATOR, name: '발전기' },
  { id: 'oxygen', name: '산소 탱크' },
  { id: 'greenhouse', name: '온실' },
  { id: 'comms', name: '통신탑' },
  { id: 'habitat', name: '거주 돔' },
];

export function moduleName(id: BaseModuleId): string {
  return MODULES.find((m) => m.id === id)?.name ?? id;
}

/** True for the module the server can break and repair in this milestone. */
export function isRepairable(id: BaseModuleId): id is ModuleId {
  return id === GENERATOR;
}
