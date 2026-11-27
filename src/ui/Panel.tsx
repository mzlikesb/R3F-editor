import { useEffect, useRef } from 'react';
import { holdProgress, type HoldEvent } from '../hold';
import { selectFaulted, useStore } from '../store';
import { canRepair } from '../sync';
import { panelView } from './view';

export function Panel() {
  const selected = useStore((s) => s.selected);
  const generatorFaulted = useStore(selectFaulted);
  const fault = useStore((s) => s.sync.base?.fault ?? null);
  const enabled = useStore((s) => canRepair(s.sync, s.connection));
  const holdKind = useStore((s) => s.repair.hold.kind);
  const button = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);

  // While the hold is time-driven (holding, pending), tick every frame and paint the fill
  // directly on the element so no React state changes per frame.
  const busy = holdKind !== 'idle';
  useEffect(() => {
    if (!busy) return;
    const el = fill.current;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const { dispatchHold } = useStore.getState();
      dispatchHold({ type: 'tick', now });
      const hold = useStore.getState().repair.hold;
      if (el) el.style.transform = `scaleX(${holdProgress(hold, now)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // The loop is the only painter, so reset the fill when it stops (release, cancel, reconnect).
      if (el) el.style.transform = 'scaleX(0)';
    };
  }, [busy]);

  // Hold is cancelled when the tab loses focus or is hidden.
  useEffect(() => {
    const cancel = () => useStore.getState().dispatchHold({ type: 'cancel', now: performance.now() });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (selected === null) return null;

  const view = panelView(selected, generatorFaulted);

  const dispatch = (event: HoldEvent) => useStore.getState().dispatchHold(event);
  const label = holdKind === 'holding' ? '계속 누르세요…' : holdKind === 'pending' ? '수리 중…' : '꾹 눌러 수리 (1초)';

  return (
    <aside className="panel" onContextMenu={(e) => e.preventDefault()}>
      <h2>{view.title}</h2>
      <p className={view.status === 'fault' ? 'status warn' : 'status ok'}>
        {view.status === 'fault' ? '⚠ 고장' : '정상'}
      </p>
      {view.goToFault && (
        <button type="button" className="goto" onClick={() => useStore.getState().select('generator')}>
          발전기 고장 — 눌러서 이동
        </button>
      )}
      {view.repairButton && (
        <button
          ref={button}
          type="button"
          className="repair"
          disabled={!enabled}
          onPointerDown={(e) => {
            // `disabled` alone is not enough: some browsers still deliver pointer events.
            if (!enabled || !fault || e.button > 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dispatch({ type: 'press', faultId: fault.id, now: performance.now() });
          }}
          onPointerUp={() => dispatch({ type: 'release', now: performance.now() })}
          onPointerCancel={() => dispatch({ type: 'cancel', now: performance.now() })}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside) dispatch({ type: 'cancel', now: performance.now() });
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span ref={fill} className="fill" />
          <span className="label">{label}</span>
        </button>
      )}
      {view.repairButton && !enabled && <p className="hint">연결되면 수리할 수 있어요</p>}
    </aside>
  );
}
