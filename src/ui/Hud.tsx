import { selectFaulted, useStore } from '../store';
import { connectionLabel, healthyLine, presenceLine, repairsLine } from './view';

/**
 * Two lines (plan 005 D.12): repairs on top, people and connection below. When a number changes its
 * `key` changes, so the CSS bump plays again; there is no count-up.
 */
export function Hud() {
  const repairs = useStore((s) => s.sync.base?.repairs);
  const presence = useStore((s) => s.sync.presence);
  const connection = useStore((s) => s.connection);
  const hasBase = useStore((s) => s.sync.base !== null);
  const faulted = useStore(selectFaulted);
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
      </div>
      {healthy && <p className="healthy">{healthy}</p>}
    </div>
  );
}
