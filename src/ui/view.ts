/**
 * Text and layout decisions for the HUD, panels and banners (plans 005, 006 C). Pure; the
 * components render what these return. Track `client` implements the TODO bodies.
 */
import { MAX_FAULTS, type Blackout, type Fault, type ModuleId } from '../../shared/protocol';
import { moduleName } from '../modules';
import type { BaseView, ConnectionStatus, LastRepairView } from '../sync';

/**
 * A length of time, coarse: `45초`, `12분`, `3시간`, `3시간 12분`, `2일`, `2일 5시간`.
 * Below a minute seconds, below an hour minutes, below a day hours (+ minutes when not 0), then
 * days (+ hours when not 0). Always floors. Negative counts as 0 (`0초`).
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return hours % 24 > 0 ? `${days}일 ${hours % 24}시간` : `${days}일`;
  if (hours > 0) return minutes % 60 > 0 ? `${hours}시간 ${minutes % 60}분` : `${hours}시간`;
  if (minutes > 0) return `${minutes}분`;
  return `${total}초`;
}

/** How long ago: `방금` (< 5 s), `12초 전`, `3분 전`, `2시간 전`, `4일 전`. Negative counts as `방금`. */
export function agoText(ms: number): string {
  if (ms < 5000) return '방금';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

type UptimeView = Pick<BaseView, 'uptimeStartedAt' | 'longestUptimeMs' | 'blackout'>;

/** Longest uptime to show: `max(longestUptimeMs, the current run)` (neon round 2: never "now 3 h / longest 0"). */
export function bestUptimeMs(base: UptimeView, serverNow: number): number {
  const current = base.blackout === null && base.uptimeStartedAt !== null ? serverNow - base.uptimeStartedAt : 0;
  return Math.max(base.longestUptimeMs, current, 0);
}

/**
 * HUD top line (plan 006 C.19): `가동 3시간 12분`; in a blackout `가동 기록 끊김 · 최장 5시간`
 * (longest from `bestUptimeMs`).
 */
export function uptimeLine(base: UptimeView, serverNow: number): string {
  if (base.blackout !== null || base.uptimeStartedAt === null) {
    return `가동 기록 끊김 · 최장 ${formatDuration(bestUptimeMs(base, serverNow))}`;
  }
  return `가동 ${formatDuration(serverNow - base.uptimeStartedAt)}`;
}

/**
 * HUD second line, short enough for a phone (playtest #47): `함께 고친 7회 · 3명 접속 중`, or
 * `함께 고친 7회 · 나 혼자 접속 중` for 0 or 1.
 */
export function peopleLine(repairs: number, presence: number): string {
  const people = presence <= 1 ? '나 혼자 접속 중' : `${presence}명 접속 중`;
  return `함께 고친 ${repairs}회 · ${people}`;
}

/** The parts of a HUD line between ` · `. Each is laid out unbroken, so a line wraps only between them. */
export function segments(line: string): string[] {
  return line.split(' · ');
}

/**
 * Under the HUD while something is broken and it is not dark yet: `고장 2개 · 3개가 되면 정전`, so the
 * count means something. Null when healthy or in a blackout (the blackout banner says it).
 */
export function faultCountLine(faultCount: number, blackout: Blackout | null): string | null {
  if (blackout !== null || faultCount <= 0) return null;
  return `고장 ${faultCount}개 · ${MAX_FAULTS}개가 되면 정전`;
}

/**
 * The HUD tells the base's state only once the scene is in and a base is known (playtest #47: it
 * said `기지 정상` under `기지를 불러오는 중…`). A server this build cannot read counts as known, so
 * the update banner is not stuck behind the loading screen.
 */
export function hudReady(s: { loaded: boolean; hasBase: boolean; incompatible: boolean }): boolean {
  return s.loaded && (s.hasBase || s.incompatible);
}

/** HUD bottom line, connection part: null when open, `연결 중…`, `재연결 중…`. */
export function connectionLabel(status: ConnectionStatus): string | null {
  if (status === 'open') return null;
  return status === 'connecting' ? '연결 중…' : '재연결 중…';
}

/** Under the HUD while nothing is broken (and a base is known). */
export function healthyLine(base: { faulted: boolean } | null): string | null {
  return base && !base.faulted ? '기지 정상 · 고장이 나면 이 화면에 떠요' : null;
}

/** Top of the HUD during a blackout (plan 006 C.18), else null. */
export function blackoutBanner(blackout: Blackout | null): string | null {
  return blackout ? '정전 — 발전기를 고쳐야 불이 돌아와요' : null;
}

/** `새 버전이 나왔어요 · 새로고침` when the protocol is incompatible (plan 006 B.13), else null. */
export function updateBanner(incompatible: boolean): string | null {
  return incompatible ? '새 버전이 나왔어요 · 새로고침' : null;
}

/**
 * HUD last-repair line (plan 006 C.19), times in server ms:
 * `마지막: 나 · 산소 탱크 · 방금`, `마지막: 다른 사람 · 온실 · 12초 전`; with helpers (#56)
 * `마지막: 나 외 2명 · …` / `마지막: 다른 사람 외 2명 · …` (whoever made it count, then the rest); when it is not known who
 * (from a snapshot, `mine` null) `마지막: 통신탑 · 3분 전`. Null without a repair.
 */
export function lastRepairLine(last: LastRepairView | null, serverNow: number): string | null {
  if (!last) return null;
  const others = last.helpers > 0 ? ` 외 ${last.helpers}명` : '';
  const who = last.mine === null ? '' : `${last.mine ? '나' : '다른 사람'}${others} · `;
  return `마지막: ${who}${moduleName(last.moduleId)} · ${agoText(serverNow - last.at)}`;
}

/** In the panel of a fault someone else is holding: `지금 1명이 같이 누르는 중`; null for 0. */
export function togetherLine(othersHolding: number): string | null {
  return othersHolding >= 1 ? `지금 ${othersHolding}명이 같이 누르는 중` : null;
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
  const own = ctx.faults.find((f) => f.moduleId === selected) ?? null;
  const title = moduleName(selected);
  if (own) {
    return {
      title,
      status: 'fault',
      repairFaultId: own.id,
      goTo: null,
      together: togetherLine(ctx.othersHolding),
    };
  }
  const target =
    (ctx.blackout ? ctx.faults.find((f) => f.moduleId === 'generator') : undefined) ??
    ctx.faults.reduce<Fault | null>(
      (oldest, f) => (oldest === null || f.createdAt < oldest.createdAt ? f : oldest),
      null,
    );
  return {
    title,
    status: 'ok',
    repairFaultId: null,
    goTo: target ? { moduleId: target.moduleId, label: `${moduleName(target.moduleId)} 고장 — 눌러서 이동` } : null,
    together: null,
  };
}

export interface HistoryView {
  /** `3시간 12분`, or `정전 중` during a blackout. */
  current: string;
  /** `formatDuration(bestUptimeMs)`. */
  longest: string;
  /**
   * Newest first, timed from when each blackout started: `16분 전 · 4분 동안` (began 16 minutes ago,
   * lasted 4), or for the one in progress `방금 · 진행 중`.
   */
  blackouts: string[];
}

/** The record panel (plan 006 C.20), from the base as kept up to date by `fault` / `repaired`. */
export function historyView(base: BaseView, serverNow: number): HistoryView {
  const dark = base.blackout !== null;
  return {
    current: dark || base.uptimeStartedAt === null ? '정전 중' : formatDuration(serverNow - base.uptimeStartedAt),
    longest: formatDuration(bestUptimeMs(base, serverNow)),
    blackouts: base.blackouts.map((r) =>
      r.endedAt === null
        ? `${agoText(serverNow - r.startedAt)} · 진행 중`
        : `${agoText(serverNow - r.startedAt)} · ${formatDuration(r.endedAt - r.startedAt)} 동안`,
    ),
  };
}
