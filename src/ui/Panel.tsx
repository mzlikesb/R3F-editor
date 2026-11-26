import { useEffect, useRef } from 'react';
import { GENERATOR } from '../../shared/protocol';
import { holdProgress, type HoldEvent } from '../hold';
import { useStore } from '../store';
import { canRepair } from '../sync';

const NOTICE_TEXT = { success: '수리 완료', beaten: '누군가 먼저 고쳤어요' } as const;

export function Panel() {
  const selected = useStore((s) => s.selected === GENERATOR);
  const fault = useStore((s) => s.sync.base?.fault ?? null);
  const enabled = useStore((s) => canRepair(s.sync, s.connection));
  const holdKind = useStore((s) => s.repair.hold.kind);
  const noticeKind = useStore((s) => s.repair.notice?.kind ?? null);
  const button = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);

  // While anything is time-driven (hold, pending, notice), tick every frame and paint the fill
  // directly on the element so no React state changes per frame.
  const busy = holdKind !== 'idle' || noticeKind !== null;
  useEffect(() => {
    if (!busy) return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const { dispatchHold } = useStore.getState();
      dispatchHold({ type: 'tick', now });
      const hold = useStore.getState().repair.hold;
      if (fill.current) fill.current.style.transform = `scaleX(${holdProgress(hold, now)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
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

  if (!selected) return null;

  const dispatch = (event: HoldEvent) => useStore.getState().dispatchHold(event);
  const label = holdKind === 'holding' ? '계속 누르세요…' : holdKind === 'pending' ? '수리 중…' : '꾹 눌러 수리 (1초)';

  return (
    <aside className="panel" onContextMenu={(e) => e.preventDefault()}>
      <h2>발전기</h2>
      <p className={fault ? 'status warn' : 'status ok'}>{fault ? '⚠ 고장' : '정상'}</p>
      <button
        ref={button}
        type="button"
        className="repair"
        disabled={!enabled}
        onPointerDown={(e) => {
          if (!fault || e.button > 0) return;
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
      {fault && !enabled && <p className="hint">연결되면 수리할 수 있어요</p>}
      <p className="notice" aria-live="polite">
        {noticeKind ? NOTICE_TEXT[noticeKind] : ''}
      </p>
    </aside>
  );
}
