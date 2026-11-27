/**
 * Text and layout decisions for the HUD and panel (plan 005 D.12, D.13). Pure; `Hud.tsx` and
 * `Panel.tsx` render what these return. Track `share`.
 */
import type { BaseModuleId } from '../modules';
import type { ConnectionStatus } from '../sync';

/** HUD top line: `함께 고친 횟수 N회`; `–` until the first snapshot. */
export function repairsLine(repairs: number | undefined): string {
  void repairs;
  throw new Error('TODO(share): repairsLine');
}

/**
 * HUD bottom line, people part: `지금 N명이 같이 지키는 중`, or `지금은 나 혼자 지키는 중` for 0 or 1
 * (0 means no presence count yet; this client is here either way).
 */
export function presenceLine(presence: number): string {
  void presence;
  throw new Error('TODO(share): presenceLine');
}

/** HUD bottom line, connection part: null when open, `연결 중…`, `재연결 중…`. */
export function connectionLabel(status: ConnectionStatus): string | null {
  void status;
  throw new Error('TODO(share): connectionLabel');
}

/** Under the HUD while nothing is broken (and a base is known): `기지 정상 가동 중 · 고장이 나면 여기에 알려 드려요`. */
export function healthyLine(base: { faulted: boolean } | null): string | null {
  void base;
  throw new Error('TODO(share): healthyLine');
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
  void selected;
  void generatorFaulted;
  throw new Error('TODO(share): panelView');
}
