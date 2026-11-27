import { useLayoutEffect, useRef } from 'react';
import { selectAnyFault, selectServerNow, useStore } from '../store';
import { connectionLabel, healthyLine, lastRepairLine, presenceLine, repairsLine } from './view';

/** Re-reads `마지막 수리 … 12초 전` once a second. */
const LAST_REPAIR_TICK_MS = 1000;

/**
 * Two lines (plan 005 D.12): repairs on top, people and connection below. When a number changes its
 * `key` changes, so the CSS bump plays again; there is no count-up.
 */
export function Hud() {
  const repairs = useStore((s) => s.sync.base?.repairs);
  const presence = useStore((s) => s.sync.presence);
  const connection = useStore((s) => s.connection);
  const hasBase = useStore((s) => s.sync.base !== null);
  const faulted = useStore(selectAnyFault);
  const label = connectionLabel(connection);
  const healthy = healthyLine(hasBase ? { faulted } : null);
  return (
    <div className="hud-wrap">
      <div className="hud" role="status">
        <div className="hud-line hud-repairs">
          <span key={repairs ?? 'none'} className="bump">
            {repairsLine(repairs)}
          </span>
        </div>
        <div className="hud-line hud-people">
          <span key={presence} className="bump">
            {presenceLine(presence)}
          </span>
          {label && <span className="warn"> · {label}</span>}
        </div>
        <LastRepair />
      </div>
      {healthy && <p className="healthy">{healthy}</p>}
    </div>
  );
}

/**
 * `마지막 수리: 다른 사람 · 12초 전`, only after a repair seen in this session. The text is written
 * straight to the element once a second, so the clock causes no React renders; a new repair
 * re-renders once (the `effect` object changes).
 */
function LastRepair() {
  const last = useStore((s) => s.sync.base?.lastRepair ?? null);
  const line = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = line.current;
    if (!el || !last) return;
    const paint = () => {
      el.textContent = lastRepairLine(last, selectServerNow(useStore.getState(), Date.now()));
    };
    paint();
    const id = setInterval(paint, LAST_REPAIR_TICK_MS);
    return () => clearInterval(id);
  }, [last]);
  if (!last) return null;
  return <div ref={line} className="hud-line hud-last" />;
}
