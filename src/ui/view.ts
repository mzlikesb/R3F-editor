/**
 * Text and layout decisions for the HUD, panels and banners (plans 005, 006 C). Pure; the
 * components render what these return. Track `client` implements the TODO bodies.
 */
import { PARTS_CAP } from '../../shared/parts';
import { MAX_FAULTS, type Blackout, type Fault, type ModuleId } from '../../shared/protocol';
import type { HoldState } from '../hold';
import { MODULES, moduleName } from '../modules';
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

/**
 * The running uptime in the HUD: seconds stay in below an hour (`45초`, `1분 5초`, `12분 34초`) so the
 * count visibly climbs, then it is `formatDuration` (`3시간 12분`). A whole minute reads `2분 0초`.
 */
export function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}초`;
  if (total < 3600) return `${Math.floor(total / 60)}분 ${total % 60}초`;
  return formatDuration(ms);
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
 * HUD top line (plan 006 C.19): `가동 12분 34초` / `가동 3시간 12분`; in a blackout `가동 기록 끊김 · 최장 5시간`
 * (longest from `bestUptimeMs`).
 */
export function uptimeLine(base: UptimeView, serverNow: number): string {
  if (base.blackout !== null || base.uptimeStartedAt === null) {
    return `가동 기록 끊김 · 최장 ${formatDuration(bestUptimeMs(base, serverNow))}`;
  }
  return `가동 ${formatUptime(serverNow - base.uptimeStartedAt)}`;
}

/**
 * HUD second line, short enough for a phone (playtest #47): `함께 고친 7회 · 3명 접속 중`, or
 * `함께 고친 7회 · 나 혼자 접속 중` for 0 or 1.
 */
export function peopleLine(repairs: number, presence: number): string {
  const people = presence <= 1 ? '나 혼자 접속 중' : `${presence}명 접속 중`;
  return `함께 고친 ${repairs}회 · ${people}`;
}

/**
 * The small warm-white diamond before `N명 접속 중`: the same colour as the drones over the base, so
 * the head count and the drones read as one thing (#108). Not when this player is alone (no drones).
 */
export function presenceMarkVisible(presence: number): boolean {
  return presence > 1;
}

/** The parts of a HUD line between ` · `. Each is laid out unbroken, so a line wraps only between them. */
export function segments(line: string): string[] {
  return line.split(' · ');
}

/**
 * Under the HUD while something is broken and it is not dark yet: `고장 2개 · 3개가 되면 정전 — 기지 불이 꺼져요`,
 * so the count means something and what the blackout does is said (#80). Null when healthy or in a blackout (the blackout banner says it).
 */
export function faultCountLine(faultCount: number, blackout: Blackout | null): string | null {
  if (blackout !== null || faultCount <= 0) return null;
  return `고장 ${faultCount}개 · ${MAX_FAULTS}개가 되면 정전 — 기지 불이 꺼져요`;
}

/**
 * The HUD tells the base's state only once the scene is in and a base is known (playtest #47: it
 * said `기지 정상` under `기지를 불러오는 중…`). A server this build cannot read counts as known, so
 * the update banner is not stuck behind the loading screen.
 */
/**
 * The scene is in: the loaders are idle at 100 % *and* every module's model is mounted (its GLB
 * decoded and its Suspense resolved, or its fallback shape). Downloads alone finish before the Draco
 * decode, which left the pill gone over bare ground (neon on #114).
 */
export function sceneLoaded(s: { assetsDone: boolean; modelsIn: number }): boolean {
  return s.assetsDone && s.modelsIn >= MODULES.length;
}

export function hudReady(s: { loaded: boolean; hasBase: boolean; incompatible: boolean }): boolean {
  return s.loaded && (s.hasBase || s.incompatible);
}

/** HUD bottom line, connection part: null when open, `연결 중…`, `재연결 중…`. */
export function connectionLabel(status: ConnectionStatus): string | null {
  if (status === 'open') return null;
  return status === 'connecting' ? '연결 중…' : '재연결 중…';
}

/**
 * Under the HUD while nothing is broken (and a base is known). With room in the store (`parts`
 * below the cap) the calm time says what to do: pick pieces up (009-2 playtest).
 */
export function healthyLine(base: { faulted: boolean; parts?: number } | null): string | null {
  if (!base || base.faulted) return null;
  if (base.parts !== undefined && base.parts < PARTS_CAP) return '기지 정상 · 조각을 주워 부품을 모아 두세요';
  return '기지 정상 · 고장이 나면 이 화면에 떠요';
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
 * `마지막: 나 외 2명 · …` / `마지막: 다른 사람 외 2명 · …` (whoever made it count, then the rest; `나` also when I helped); when it is not known who
 * (from a snapshot, `mine` null) `마지막: 통신탑 · 3분 전`. Null without a repair.
 */
export function lastRepairLine(last: LastRepairView | null, serverNow: number): string | null {
  if (!last) return null;
  const others = last.helpers > 0 ? ` 외 ${last.helpers}명` : '';
  // I made it count or helped: either way I am in it (009-2 playtest).
  const me = last.mine === true || last.helped;
  const who = last.mine === null ? '' : `${me ? '나' : '다른 사람'}${others} · `;
  return `마지막: ${who}${moduleName(last.moduleId)} · ${agoText(serverNow - last.at)}`;
}

/** In the panel of a fault someone else is holding: `지금 1명이 같이 누르는 중`; null for 0. */
export function togetherLine(othersHolding: number): string | null {
  return othersHolding >= 1 ? `지금 ${othersHolding}명이 같이 누르는 중` : null;
}

/**
 * The HUD's store chip (plan 009 B.3, R4): `부품 3/5`, `부품 0/5`; at the cap `부품 가득`, accented.
 * `short` (`⬢ 3/5`) is what a narrow phone shows, so the top line never wraps.
 */
export function partsChip(parts: number): { text: string; short: string; full: boolean } {
  const short = `⬢ ${Math.min(parts, PARTS_CAP)}/${PARTS_CAP}`;
  return parts >= PARTS_CAP
    ? { text: '기지 창고 가득', short, full: true }
    : { text: `기지 창고 ${parts}/${PARTS_CAP}`, short, full: false };
}

/** Above the `fetch` button: why it is not a repair button (009-2 playtest 3). */
export const PARTS_NEEDED_LINE = '수리에 부품 1개가 필요해요';

/** Every way of running out of parts at the repair says this (plan 009 B.5). */
export const NO_PARTS_NOTICE = '부품이 없어요 — 조각을 주워요';

/**
 * The repair button (plan 009 B.4). `repair`: hold to repair, `꾹 눌러 수리 (1초 · 부품 1)` (and the
 * hold labels). `fetch` with an empty store: `부품 있는 곳 보기` while a piece is out, else
 * `다음 부품 7초` (whole seconds, rounded up); pressing it goes back to the overview and pings the piece.
 */
export function repairButton(ctx: { hold: HoldState['kind']; parts: number; out: boolean; msToNext: number }): {
  mode: 'repair' | 'fetch';
  label: string;
} {
  if (ctx.hold === 'holding') return { mode: 'repair', label: '계속 누르세요…' };
  if (ctx.hold === 'pending') return { mode: 'repair', label: '수리 중…' };
  if (ctx.parts >= 1) return { mode: 'repair', label: '꾹 눌러 수리 (1초 · 부품 1)' };
  if (ctx.out) return { mode: 'fetch', label: '부품 있는 곳 보기' };
  return { mode: 'fetch', label: `다음 부품 ${Math.max(1, Math.ceil(ctx.msToNext / 1000))}초` };
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
