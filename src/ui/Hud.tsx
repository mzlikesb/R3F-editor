import { useLayoutEffect, useRef } from 'react';
import { selectFaults, selectReady, selectServerNow, useStore } from '../store';
import { subscribeClock } from './clock';
import {
  blackoutBanner,
  connectionLabel,
  faultCountLine,
  healthyLine,
  lastRepairLine,
  partsChip,
  peopleLine,
  presenceMarkVisible,
  segments,
  updateBanner,
  uptimeLine,
} from './view';

/**
 * One block at the top (plan 006 C.18-C.19): blackout banner, the tappable HUD (uptime and the
 * `기록` cue, repairs and people, last repair), the healthy or fault-count line and the update
 * banner. Stacked in a single column so they never cover the module badges below. Three lines at
 * most on a 390 px phone: every ` · ` part is laid out unbroken (playtest #47: `0회` and `1분 전`
 * fell onto lines of their own). Until the scene and the base are in, only the loading screen
 * speaks (it said `기지 정상` under `기지를 불러오는 중…`).
 */
export function Hud() {
  const presence = useStore((s) => s.sync.presence);
  const repairs = useStore((s) => s.sync.base?.repairs ?? 0);
  const connection = useStore((s) => s.connection);
  const faultCount = useStore((s) => selectFaults(s).length);
  const blackout = useStore((s) => s.sync.base?.blackout ?? null);
  const incompatible = useStore((s) => s.sync.incompatible);
  const historyOpen = useStore((s) => s.historyOpen);
  const ready = useStore(selectReady);
  const hasBase = useStore((s) => s.sync.base !== null);
  const label = connectionLabel(connection);
  const banner = blackoutBanner(blackout);
  const update = updateBanner(incompatible);
  const status = hasBase ? (faultCountLine(faultCount, blackout) ?? healthyLine({ faulted: faultCount > 0 })) : null;
  const shown = ready && hasBase;
  return (
    <div className="hud-wrap">
      {shown && banner && (
        <p className="banner banner-blackout" role="status">
          {banner}
        </p>
      )}
      {shown && (
        <button
          type="button"
          className="hud"
          aria-label="기지 기록 보기"
          aria-expanded={historyOpen}
          onClick={() => useStore.getState().openHistory(!historyOpen)}
        >
          <span className="hud-line hud-top">
            <UptimeLine />
            <PartsChip />
            <span className="hud-cue" aria-hidden="true">
              <RecordIcon />
              기록
            </span>
          </span>
          <span className="hud-line hud-people">
            <Segments line={peopleLine(repairs, presence)} bumpKey={presence} mark={presenceMarkVisible(presence)} />
            {label && (
              <>
                {' · '}
                <span className="seg warn">{label}</span>
              </>
            )}
          </span>
          <LastRepair />
        </button>
      )}
      {shown && status && <p className={faultCount > 0 ? 'healthy faults' : 'healthy'}>{status}</p>}
      {update && (
        <button type="button" className="banner banner-update" onClick={() => location.reload()}>
          {update}
        </button>
      )}
    </div>
  );
}

/**
 * A line as unbroken parts joined by ` · `. The last part (people) bumps when `bumpKey` changes and,
 * with `mark`, starts with the drones' diamond.
 */
function Segments({ line, bumpKey, mark }: { line: string; bumpKey: number; mark: boolean }) {
  const parts = segments(line);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {i === parts.length - 1 ? (
            <span key={bumpKey} className="seg bump">
              {mark && <span className="presence-mark" aria-hidden="true" />}
              {part}
            </span>
          ) : (
            <span className="seg">{part}</span>
          )}
        </span>
      ))}
    </>
  );
}

/** Writes `line` into `node` as unbroken parts, rebuilding only when the text changed. */
function paintSegments(node: HTMLElement, line: string): void {
  if (node.dataset.text === line) return;
  node.dataset.text = line;
  const children: Node[] = [];
  segments(line).forEach((part, i) => {
    if (i > 0) children.push(document.createTextNode(' · '));
    const seg = document.createElement('span');
    seg.className = 'seg';
    seg.textContent = part;
    children.push(seg);
  });
  node.replaceChildren(...children);
}

/**
 * `가동 3시간 12분`, or `가동 기록 끊김 · 최장 5시간`. Written straight to the element once a second,
 * so the clock causes no React renders; a changed base re-runs the effect once.
 */
function UptimeLine() {
  const uptimeStartedAt = useStore((s) => s.sync.base?.uptimeStartedAt ?? null);
  const longestUptimeMs = useStore((s) => s.sync.base?.longestUptimeMs ?? 0);
  const blackout = useStore((s) => s.sync.base?.blackout ?? null);
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const base = { uptimeStartedAt, longestUptimeMs, blackout };
    // The shared clock, so the record card reads the same second (#80).
    return subscribeClock((now) => paintSegments(node, uptimeLine(base, selectServerNow(useStore.getState(), now))));
  }, [uptimeStartedAt, longestUptimeMs, blackout]);
  return <span ref={el} />;
}

/** `마지막: 다른 사람 · 산소 탱크 · 12초 전`, only once a repair is known. Same DOM-ref clock. */
function LastRepair() {
  const last = useStore((s) => s.sync.base?.lastRepair ?? null);
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = line.current;
    if (!node || !last) return;
    return subscribeClock((now) => {
      const text = lastRepairLine(last, selectServerNow(useStore.getState(), now));
      if (text) paintSegments(node, text);
    });
  }, [last]);
  if (!last) return null;
  return <span ref={line} className="hud-line hud-last" />;
}

/** `부품 3/5` between the uptime and `기록` (plan 009 R4); `부품 가득`, accented, at the cap. */
function PartsChip() {
  const parts = useStore((s) => s.sync.base?.parts ?? 0);
  const chip = partsChip(parts);
  return (
    <span key={parts} className={chip.full ? 'hud-parts hud-parts-full bump' : 'hud-parts bump'}>
      {chip.text}
    </span>
  );
}

/** A small list mark next to `기록`: the HUD opens the record panel. */
function RecordIcon() {
  return (
    <svg className="hud-cue-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M1.5 2.5h9M1.5 6h9M1.5 9.5h6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
