import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { clockNow, subscribeClock } from './clock';
import { historyView } from './view';

/** The base's record (plan 006 C.20): uptime now, the longest, recent blackouts. Never open with the repair panel. */
export function RecordPanel() {
  const base = useStore((s) => s.sync.base);
  const offset = useStore((s) => s.sync.clockOffsetMs);
  const [now, setNow] = useState(clockNow);

  useEffect(() => {
    const off = subscribeClock(setNow);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().openHistory(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const view = base ? historyView(base, now + offset) : null;
  return (
    <aside className="panel record-panel">
      <div className="panel-head">
        <h2>기지 기록</h2>
        <button
          type="button"
          className="panel-close"
          aria-label="닫기"
          onClick={() => useStore.getState().openHistory(false)}
        >
          ✕
        </button>
      </div>
      {view ? (
        <>
          <p className="record-row">
            <span>지금 가동</span>
            <strong>{view.current}</strong>
          </p>
          <p className="record-row">
            <span>최장 가동</span>
            <strong>{view.longest}</strong>
          </p>
          <h3 className="record-sub">최근 정전</h3>
          {view.blackouts.length === 0 ? (
            <p className="hint">아직 정전이 없었어요</p>
          ) : (
            <ul className="record-list">
              {view.blackouts.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="hint">기록을 불러오는 중…</p>
      )}
    </aside>
  );
}
