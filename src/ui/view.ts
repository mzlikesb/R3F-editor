/**
 * Text and layout decisions for the HUD, panels and banners (plans 005, 006 C). Pure; the
 * components render what these return. Track `client` implements the TODO bodies.
 */
import type { Blackout, Fault, ModuleId } from '../../shared/protocol';
import type { BaseView, ConnectionStatus, LastRepairView } from '../sync';

/** HUD: `함께 고친 횟수 N회`; `–` until the first snapshot. */
export function repairsLine(repairs: number | undefined): string {
  return `함께 고친 횟수 ${repairs ?? '–'}회`;
}

/**
 * A length of time, coarse: `45초`, `12분`, `3시간`, `3시간 12분`, `2일`, `2일 5시간`.
 * Below a minute seconds, below an hour minutes, below a day hours (+ minutes when not 0), then
 * days (+ hours when not 0). Always floors. Negative counts as 0 (`0초`).
 */
export function formatDuration(ms: number): string {
  void ms;
  throw new Error('TODO(client): formatDuration');
}

/** How long ago: `방금` (< 5 s), `12초 전`, `3분 전`, `2시간 전`, `4일 전`. Negative counts as `방금`. */
export function agoText(ms: number): string {
  void ms;
  throw new Error('TODO(client): agoText');
}

type UptimeView = Pick<BaseView, 'uptimeStartedAt' | 'longestUptimeMs' | 'blackout'>;

/** Longest uptime to show: `max(longestUptimeMs, the current run)` (neon round 2: never "now 3 h / longest 0"). */
export function bestUptimeMs(base: UptimeView, serverNow: number): number {
  void base;
  void serverNow;
  throw new Error('TODO(client): bestUptimeMs');
}

/**
 * HUD top line (plan 006 C.19): `가동 3시간 12분 · 함께 고친 횟수 N회`; in a blackout
 * `가동 기록 끊김 · 최장 5시간 · 함께 고친 횟수 N회` (longest from `bestUptimeMs`); before any base
 * `함께 고친 횟수 –회`.
 */
export function hudTopLine(base: (UptimeView & { repairs: number }) | null, serverNow: number): string {
  void base;
  void serverNow;
  throw new Error('TODO(client): hudTopLine');
}

/**
 * HUD bottom line, people part: `지금 N명이 같이 지키는 중`, or `지금은 나 혼자 지키는 중` for 0 or 1.
 */
export function presenceLine(presence: number): string {
  return presence <= 1 ? '지금은 나 혼자 지키는 중' : `지금 ${presence}명이 같이 지키는 중`;
}

/** HUD bottom line, connection part: null when open, `연결 중…`, `재연결 중…`. */
export function connectionLabel(status: ConnectionStatus): string | null {
  if (status === 'open') return null;
  return status === 'connecting' ? '연결 중…' : '재연결 중…';
}

/** Under the HUD while nothing is broken (and a base is known). */
export function healthyLine(base: { faulted: boolean } | null): string | null {
  return base && !base.faulted ? '기지 정상 · 고장 나면 알려 드려요' : null;
}

/** Top of the HUD during a blackout (plan 006 C.18), else null. */
export function blackoutBanner(blackout: Blackout | null): string | null {
  void blackout;
  throw new Error('TODO(client): blackoutBanner');
}

/** `새 버전이 나왔어요 · 새로고침` when the protocol is incompatible (plan 006 B.13), else null. */
export function updateBanner(incompatible: boolean): string | null {
  void incompatible;
  throw new Error('TODO(client): updateBanner');
}

/**
 * HUD `마지막 수리` line (plan 006 C.19), times in server ms:
 * `마지막 수리: 나 · 산소 탱크 · 방금`, `마지막 수리: 다른 사람 · 온실 · 12초 전`, and when it is not
 * known who (from a snapshot, `mine` null) `마지막 수리: 통신탑 · 3분 전`. Null without a repair.
 */
export function lastRepairLine(last: LastRepairView | null, serverNow: number): string | null {
  void last;
  void serverNow;
  throw new Error('TODO(client): lastRepairLine');
}

/** In the panel of a fault someone else is holding: `지금 1명이 같이 누르는 중`; null for 0. */
export function togetherLine(othersHolding: number): string | null {
  void othersHolding;
  throw new Error('TODO(client): togetherLine');
}

export interface PanelView {
  title: string;
  status: 'fault' | 'ok';
  /** The selected module is broken: show the hold-to-repair button for this fault. */
  repairFaultId: string | null;
  /** The selected module is fine but something else is broken: where the "go" button leads. */
  goTo: { moduleId: ModuleId; label: string } | null;
  /** `지금 1명이 같이 누르는 중` (from `togetherLine`). */
  together: string | null;
}

/**
 * The panel of `selected` (plan 006 C.15-C.17).
 * - Broken: status `fault`, `repairFaultId` = its fault, `together` from `othersHolding`, `goTo` null.
 * - Fine, something else broken: `goTo` = the generator during a blackout (if broken), else the
 *   oldest fault; label `발전기 고장 — 눌러서 이동` (module name). `together` null.
 * - Nothing broken: all null, status `ok`.
 */
export function panelView(
  selected: ModuleId,
  ctx: { faults: readonly Fault[]; blackout: Blackout | null; othersHolding: number },
): PanelView {
  void selected;
  void ctx;
  throw new Error('TODO(client): panelView');
}

export interface HistoryView {
  /** `3시간 12분`, or `정전 중` during a blackout. */
  current: string;
  /** `formatDuration(bestUptimeMs)`. */
  longest: string;
  /** Newest first: `12분 전 · 4분 동안`, or for the one in progress `방금 · 진행 중`. */
  blackouts: string[];
}

/** The record panel (plan 006 C.20), from the base as kept up to date by `fault` / `repaired`. */
export function historyView(base: BaseView, serverNow: number): HistoryView {
  void base;
  void serverNow;
  throw new Error('TODO(client): historyView');
}
