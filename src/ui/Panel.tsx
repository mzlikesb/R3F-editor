import { useEffect, useLayoutEffect, useRef } from 'react';
import { holdProgress, type HoldEvent } from '../hold';
import { selectFaults, selectModuleFault, selectOthersHolding, selectServerNow, useStore } from '../store';
import { canRepair } from '../sync';
import { PANEL_TICK_MS, sensorLine, trendBaselineY, trendOutsidePath, trendPoints, trendSamples } from './sensorView';
import { panelView } from './view';

/** The trend's drawing box; the SVG scales it to the panel width. */
const TREND_W = 100;
const TREND_H = 24;

export function Panel() {
  const selected = useStore((s) => s.selected);
  const faults = useStore(selectFaults);
  const blackout = useStore((s) => s.sync.base?.blackout ?? null);
  const fault = useStore((s) => (s.selected ? selectModuleFault(s, s.selected) : null));
  const othersHolding = useStore((s) => (s.selected ? selectOthersHolding(s, s.selected) : 0));
  const enabled = useStore((s) => fault !== null && canRepair(s.sync, s.connection, fault.id));
  const holdKind = useStore((s) => s.repair.hold.kind);
  // An incompatible server also disables the button; the update banner already says why.
  const incompatible = useStore((s) => s.sync.incompatible);
  const button = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const sensorText = useRef<HTMLParagraphElement>(null);
  const trendLine = useRef<SVGPolylineElement>(null);
  const trendOutside = useRef<SVGPathElement>(null);

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

  // The open panel re-reads its module's sensor twice a second, straight into the DOM.
  useLayoutEffect(() => {
    if (selected === null) return;
    const paint = () => {
      const now = selectServerNow(useStore.getState(), Date.now());
      if (sensorText.current) sensorText.current.textContent = sensorLine(selected, fault, now);
      const values = trendSamples(selected, fault, now);
      trendLine.current?.setAttribute('points', trendPoints(selected, values, TREND_W, TREND_H));
      trendOutside.current?.setAttribute('d', trendOutsidePath(selected, values, TREND_W, TREND_H));
    };
    paint();
    const id = setInterval(paint, PANEL_TICK_MS);
    return () => clearInterval(id);
  }, [selected, fault]);

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

  // Esc closes the panel like the ✕ (desktop players reach for it).
  const open = selected !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (selected === null) return null;

  const view = panelView(selected, { faults, blackout, othersHolding });
  // The faint dashed line is the healthy level; the part of the trend away from it turns red.
  const baselineY = trendBaselineY(selected, TREND_H);
  const repairButton = view.repairFaultId !== null;

  const dispatch = (event: HoldEvent) => useStore.getState().dispatchHold(event);
  const label = holdKind === 'holding' ? '계속 누르세요…' : holdKind === 'pending' ? '수리 중…' : '꾹 눌러 수리 (1초)';

  return (
    <aside className="panel" onContextMenu={(e) => e.preventDefault()}>
      <div className="panel-head">
        <h2>{view.title}</h2>
        <p className={view.status === 'fault' ? 'status warn' : 'status ok'}>
          {view.status === 'fault' ? '⚠ 고장' : '정상'}
        </p>
        <button
          type="button"
          className="panel-close"
          aria-label="닫기"
          onClick={() => useStore.getState().select(null)}
        >
          ✕
        </button>
      </div>
      <p ref={sensorText} className="sensor-line" />
      <svg
        className={view.status === 'fault' ? 'trend trend-tall' : 'trend'}
        viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="최근 30초 추이"
      >
        <line className="trend-base" x1={0} x2={TREND_W} y1={baselineY} y2={baselineY} />
        <polyline ref={trendLine} className="trend-line" />
        <path ref={trendOutside} className="trend-outside" />
      </svg>
      {view.goTo && (
        <button
          type="button"
          className="goto"
          onClick={() => view.goTo && useStore.getState().select(view.goTo.moduleId)}
        >
          {view.goTo.label}
        </button>
      )}
      {view.together && <p className="hint">{view.together}</p>}
      {repairButton && (
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
      {repairButton && !enabled && !incompatible && <p className="hint">연결되면 수리할 수 있어요</p>}
    </aside>
  );
}
