/**
 * Which label a module shows (playtest of PR #45: from some angles the generator tag and a selected
 * module's tag lined up on top of each other). Pure, unit tested.
 */
import { GENERATOR } from '../../../shared/protocol';
import { moduleName, type BaseModuleId } from '../../modules';

export type LabelKind = 'badge' | 'tag' | null;

/**
 * - the broken module: its fault badge, always;
 * - the generator, healthy: its name tag while nothing else is selected;
 * - another module: its name tag while selected, unless something else is broken (the badge wins).
 * So at most one label is on screen and two can never overlap.
 */
export function labelKind(
  id: BaseModuleId,
  state: { selected: BaseModuleId | null; faulted: BaseModuleId | null },
): LabelKind {
  const { selected, faulted } = state;
  if (faulted === id) return 'badge';
  if (faulted !== null) return null;
  if (selected === id) return 'tag';
  return id === GENERATOR && selected === null ? 'tag' : null;
}

/** The badge asks for a tap only while that module's panel is closed (the panel has the button). */
export function badgeText(id: BaseModuleId, selected: BaseModuleId | null): string {
  const base = `⚠ ${moduleName(id)} 고장`;
  return selected === id ? base : `${base} · 눌러서 수리`;
}
