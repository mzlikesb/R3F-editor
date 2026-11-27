/**
 * Text and layout decisions for the HUD and panel (plan 005 D.12, D.13). Pure; `Hud.tsx` and
 * `Panel.tsx` render what these return. Track `share`.
 */
import { isRepairable, moduleName, type BaseModuleId } from '../modules';
import type { ConnectionStatus } from '../sync';

/** HUD top line: `함께 고친 횟수 N회`; `–` until the first snapshot. */
export function repairsLine(repairs: number | undefined): string {
  return `함께 고친 횟수 ${repairs ?? '–'}회`;
}

/**
 * HUD bottom line, people part: `지금 N명이 같이 지키는 중`, or `지금은 나 혼자 지키는 중` for 0 or 1
 * (0 means no presence count yet; this client is here either way).
 */
export function presenceLine(presence: number): string {
  return presence <= 1 ? '지금은 나 혼자 지키는 중' : `지금 ${presence}명이 같이 지키는 중`;
}

/** HUD bottom line, connection part: null when open, `연결 중…`, `재연결 중…`. */
export function connectionLabel(status: ConnectionStatus): string | null {
  if (status === 'open') return null;
  return status === 'connecting' ? '연결 중…' : '재연결 중…';
}

/** Under the HUD while nothing is broken (and a base is known): `기지 정상 가동 중 · 고장이 나면 여기에 알려 드려요`. */
export function healthyLine(base: { faulted: boolean } | null): string | null {
  return base && !base.faulted ? '기지 정상 가동 중 · 고장이 나면 여기에 알려 드려요' : null;
}

export interface PanelView {
  /** Module name. */
  title: string;
  status: 'fault' | 'ok';
  /** Show the hold-to-repair button (the selected module is the broken, repairable one). */
  repairButton: boolean;
  /** Show `발전기 고장 — 눌러서 이동` (another module is selected while the generator is broken). */
  goToFault: boolean;
}

/** What the panel shows for the selected module, given whether the generator is broken. */
export function panelView(selected: BaseModuleId, generatorFaulted: boolean): PanelView {
  const repairable = isRepairable(selected);
  return {
    title: moduleName(selected),
    status: repairable && generatorFaulted ? 'fault' : 'ok',
    repairButton: repairable && generatorFaulted,
    goToFault: !repairable && generatorFaulted,
  };
}
