import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { partSlot } from '../../shared/parts';
import { holdProgress, type HoldEvent } from '../hold';
import { msToNextSlot, pieceOut } from '../parts';
import { selectFaults, selectModuleFault, selectOthersHolding, selectServerNow, useStore } from '../store';
import { canRepair } from '../sync';
import { subscribeClock } from './clock';
import { GOTO_LOCK_MS, NO_LOCK, goToLocked, stepGoToLock, type GoToLock } from './goToLock';
import { PANEL_TICK_MS, sensorLine, trendBaselineY, trendOutsidePath, trendPoints, trendSamples } from './sensorView';
import { NO_PARTS_NOTICE, panelView, repairButton as repairAction } from './view';

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
  const parts = useStore((s) => s.sync.base?.parts ?? 0);
  const lastPartSlot = useStore((s) => s.sync.base?.lastPartSlot ?? -1);
  const partsNotice = useStore((s) => s.partsNotice);
  const clockOffsetMs = useStore((s) => s.sync.clockOffsetMs);
  const button = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const sensorText = useRef<HTMLParagraphElement>(null);
  const trendLine = useRef<SVGPolylineElement>(null);
  const trendOutside = useRef<SVGPathElement>(null);

  // The go-to button's target can change under the finger: lock it for a moment when it does (#80).
  const goToId =
    selected !== null ? panelView(selected, { faults, blackout, othersHolding }).goTo?.moduleId : undefined;
  const lock = useRef<GoToLock>(NO_LOCK);
  const [goToBusy, setGoToBusy] = useState(false);
  useEffect(() => {
    if (selected === null) {
      lock.current = NO_LOCK;
      return;
    }
    const now = performance.now();
    lock.current = stepGoToLock(lock.current, selected, goToId ?? null, now);
    if (!goToLocked(lock.current, now)) return;
    setGoToBusy(true);
    const id = setTimeout(() => setGoToBusy(false), GOTO_LOCK_MS);
    return () => {
      clearTimeout(id);
      setGoToBusy(false);
    };
  }, [selected, goToId]);

  // With an empty store the button counts down to the next piece: re-render on the shared clock.
  const [clock, setClock] = useState(() => Date.now());
  const counting = fault !== null && parts === 0;
  useEffect(() => (counting ? subscribeClock(setClock) : undefined), [counting]);

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
  const calm = !view.goTo && !repairButton;

  const dispatch = (event: HoldEvent) => useStore.getState().dispatchHold(event);
  const now = clock + clockOffsetMs;
  const action = repairAction({
    hold: holdKind,
    parts,
    out: pieceOut({ parts, lastPartSlot }, partSlot(now)),
    msToNext: msToNextSlot(now),
  });
  const fetch = repairButton && action.mode === 'fetch';

  return (
    <aside className={calm ? 'panel panel-calm' : 'panel'} onContextMenu={(e) => e.preventDefault()}>
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
        className="trend"
        viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="최근 30초 추이"
      >
        <line className="trend-base" x1={0} x2={TREND_W} y1={baselineY} y2={baselineY} />
        <polyline ref={trendLine} className="trend-line" />
        <path ref={trendOutside} className="trend-outside" />
      </svg>
      {/* One fixed-height slot for the action, so the card never changes size (the ✕ stays put). */}
      <div className="panel-action">
        {view.goTo && (
          <button
            type="button"
            className={goToBusy ? 'goto goto-changed' : 'goto'}
            aria-disabled={goToBusy}
            // Keyed by target: a new target replays the change animation.
            key={view.goTo.moduleId}
            onClick={() => {
              if (!view.goTo || goToLocked(lock.current, performance.now())) return;
              useStore.getState().select(view.goTo.moduleId);
            }}
          >
            {view.goTo.label}
          </button>
        )}
        {fetch && (
          <button
            type="button"
            className="repair repair-fetch"
            onClick={() => useStore.getState().fetchParts(Date.now())}
          >
            <span className="label">{action.label}</span>
          </button>
        )}
        {repairButton && !fetch && (
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
            <span className="label">{action.label}</span>
          </button>
        )}
        {!view.goTo && !repairButton && <p className="action-none">지금 고장 난 곳이 없어요</p>}
      </div>
      <p className="hint">
        {partsNotice
          ? NO_PARTS_NOTICE
          : (view.together ?? (repairButton && !fetch && !enabled && !incompatible ? '연결되면 수리할 수 있어요' : ''))}
      </p>
    </aside>
  );
}
