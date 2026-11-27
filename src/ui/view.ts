/**
 * Text and layout decisions for the HUD and panel (plan 005 D.12, D.13). Pure; `Hud.tsx` and
 * `Panel.tsx` render what these return. Track `share`.
 */
import { isRepairable, moduleName, type BaseModuleId } from '../modules';
import type { RepairOutcome } from '../feedback';
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

/** Under the HUD while nothing is broken (and a base is known). Short enough for one line on a phone. */
export function healthyLine(base: { faulted: boolean } | null): string | null {
  return base && !base.faulted ? '기지 정상 · 고장 나면 알려 드려요' : null;
}

/** Below this the last repair reads `방금`. */
const JUST_NOW_MS = 5000;

/**
 * HUD line `마지막 수리: 나 · 방금` / `마지막 수리: 다른 사람 · 12초 전`, from the last repair seen in
 * this session (`FeedbackState.effect`) and the same client clock (`performance.now()`). Null until
 * a repair happened while this tab was open.
 */
export function lastRepairLine(last: { outcome: RepairOutcome; at: number } | null, now: number): string | null {
  if (!last) return null;
  const who = last.outcome === 'mine' ? '나' : '다른 사람';
  const ms = now - last.at;
  let ago: string;
  if (ms < JUST_NOW_MS) ago = '방금';
  else if (ms < 60_000) ago = `${Math.floor(ms / 1000)}초 전`;
  else if (ms < 3_600_000) ago = `${Math.floor(ms / 60_000)}분 전`;
  else ago = `${Math.floor(ms / 3_600_000)}시간 전`;
  return `마지막 수리: ${who} · ${ago}`;
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
