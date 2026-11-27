import { useLayoutEffect, useRef } from 'react';
import { selectAnyFault, selectServerNow, useStore } from '../store';
import {
  blackoutBanner,
  connectionLabel,
  healthyLine,
  hudTopLine,
  lastRepairLine,
  presenceLine,
  updateBanner,
} from './view';

/** Re-reads the clock-driven HUD text (uptime, `마지막 수리 … 12초 전`) this often. */
const HUD_TICK_MS = 1000;

/**
 * One block at the top (plan 006 C.18-C.19): blackout banner, the tappable HUD (uptime and repairs,
 * people and connection, last repair), the healthy line and the update banner. Stacked in a single
 * column so they never cover the module badges below.
 */
export function Hud() {
  const presence = useStore((s) => s.sync.presence);
  const connection = useStore((s) => s.connection);
  const hasBase = useStore((s) => s.sync.base !== null);
  const faulted = useStore(selectAnyFault);
  const blackout = useStore((s) => s.sync.base?.blackout ?? null);
  const incompatible = useStore((s) => s.sync.incompatible);
  const historyOpen = useStore((s) => s.historyOpen);
  const label = connectionLabel(connection);
  const healthy = healthyLine(hasBase ? { faulted } : null);
  const banner = blackoutBanner(blackout);
  const update = updateBanner(incompatible);
  return (
    <div className="hud-wrap">
      {banner && (
        <p className="banner banner-blackout" role="status">
          {banner}
        </p>
      )}
      <button
        type="button"
        className="hud"
        aria-label="기지 기록 보기"
        aria-expanded={historyOpen}
        onClick={() => useStore.getState().openHistory(!historyOpen)}
      >
        <span className="hud-line hud-top">
          <TopLine />
          <span className="hud-cue" aria-hidden="true">
            ›
          </span>
        </span>
        <span className="hud-line hud-people">
          <span key={presence} className="bump">
            {presenceLine(presence)}
          </span>
          {label && <span className="warn"> · {label}</span>}
        </span>
        <LastRepair />
      </button>
      {healthy && <p className="healthy">{healthy}</p>}
      {update && (
        <button type="button" className="banner banner-update" onClick={() => location.reload()}>
          {update}
        </button>
      )}
    </div>
  );
}

/**
 * `가동 3시간 12분 · 함께 고친 횟수 N회`. Written straight to the element once a second, so the
 * clock causes no React renders; a changed base re-runs the effect once.
 */
function TopLine() {
  const repairs = useStore((s) => s.sync.base?.repairs);
  const uptimeStartedAt = useStore((s) => s.sync.base?.uptimeStartedAt ?? null);
  const longestUptimeMs = useStore((s) => s.sync.base?.longestUptimeMs ?? 0);
  const blackout = useStore((s) => s.sync.base?.blackout ?? null);
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const base = repairs === undefined ? null : { repairs, uptimeStartedAt, longestUptimeMs, blackout };
    const paint = () => {
      node.textContent = hudTopLine(base, selectServerNow(useStore.getState(), Date.now()));
    };
    paint();
    const id = setInterval(paint, HUD_TICK_MS);
    return () => clearInterval(id);
  }, [repairs, uptimeStartedAt, longestUptimeMs, blackout]);
  return <span ref={el} />;
}

/** `마지막 수리: 다른 사람 · 산소 탱크 · 12초 전`, only once a repair is known. Same DOM-ref clock. */
function LastRepair() {
  const last = useStore((s) => s.sync.base?.lastRepair ?? null);
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = line.current;
    if (!node || !last) return;
    const paint = () => {
      node.textContent = lastRepairLine(last, selectServerNow(useStore.getState(), Date.now()));
    };
    paint();
    const id = setInterval(paint, HUD_TICK_MS);
    return () => clearInterval(id);
  }, [last]);
  if (!last) return null;
  return <span ref={line} className="hud-line hud-last" />;
}
