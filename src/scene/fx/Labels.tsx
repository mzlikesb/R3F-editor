import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { sensorReading, sensorValue } from '../../../shared/sensors';
import type { Fault } from '../../../shared/protocol';
import { moduleName, type BaseModuleId } from '../../modules';
import { selectReady, selectServerNow, useStore } from '../../store';
import { isLabelOccluded } from './labelOcclusion';
import { badgeText, dotText, LABEL_WRAPPER_STYLE } from './labelRules';
import { labelShift, tailOffset } from './labelClamp';
import { STATUS_LIGHT_TOP } from './StatusLight';
import './fx.css';

/**
 * World units between the model's top and the bottom edge of a label. Labels hang from their
 * bottom edge (not their center), so they never come down over the module or its status light
 * (playtest #47: the name tag covered the green light, the badge covered the module's top).
 * A healthy module's tag clears the status light; a broken one has no light, so its badge sits lower.
 */
const TAG_LIFT = STATUS_LIGHT_TOP + 0.15;
const BADGE_LIFT = 0.45;
/** The badge's sensor reading is rewritten this often (ms), straight into the DOM. */
const SENSOR_TICK_MS = 500;

function selectModule(e: MouseEvent, id: BaseModuleId) {
  e.stopPropagation();
  useStore.getState().select(id);
}

/**
 * An `Html` label whose bottom edge sits `lift` world units above the model's top, with a short
 * leader line down to that point so it reads as this module's. While another module stands between
 * the camera and this one (and this one is not selected) it is drawn faint (`isLabelOccluded`).
 * The class is flipped only when the answer changes, straight on the DOM node.
 */
function Anchored({
  id,
  height,
  unit,
  lift,
  children,
}: {
  id: BaseModuleId;
  height: number;
  unit: number;
  lift: number;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const dim = useRef(false);
  const shift = useRef({ dx: 0, dy: 0 });
  useFrame(({ camera }) => {
    const el = anchor.current;
    if (!el) return;
    clampToScreen(el, shift.current);
    const next =
      useStore.getState().selected !== id &&
      isLabelOccluded(id, camera.position.x, camera.position.y, camera.position.z);
    if (next === dim.current) return;
    dim.current = next;
    el.classList.toggle('fx-dim', next);
  });
  return (
    <Html position={[0, height + lift * unit, 0]} style={LABEL_WRAPPER_STYLE} zIndexRange={[0, 0]}>
      <AnchorBox anchor={anchor}>{children}</AnchorBox>
    </Html>
  );
}

/** The HUD column's bottom edge in px, 0 while it is not on screen. */
function hudBottom(): number {
  const wrap = document.querySelector('.hud-wrap');
  const r = wrap?.getBoundingClientRect();
  return r && r.height > 0 ? r.bottom : 0;
}

/**
 * Keeps the label inside the screen and under the HUD (#80). The node's rect includes the shift
 * applied last frame, so subtract it to see where the label would be unshifted. Writes only when
 * the shift changes.
 */
function clampToScreen(el: HTMLElement, shift: { dx: number; dy: number }) {
  const r = el.getBoundingClientRect();
  if (r.width === 0) return;
  const next = labelShift(
    { left: r.left - shift.dx, right: r.right - shift.dx, top: r.top - shift.dy },
    document.documentElement.clientWidth,
    hudBottom(),
  );
  if (Math.abs(next.dx - shift.dx) < 0.5 && Math.abs(next.dy - shift.dy) < 0.5) return;
  shift.dx = next.dx;
  shift.dy = next.dy;
  el.style.setProperty('--fx-dx', `${Math.round(next.dx)}px`);
  el.style.setProperty('--fx-dy', `${Math.round(next.dy)}px`);
  el.style.setProperty('--fx-tail', `${Math.round(tailOffset(next.dx, r.width))}px`);
  el.classList.toggle('fx-lowered', next.dy > 0);
}

/**
 * The label's root element. `Html` renders in its own React root, which only gets going a render or
 * two after the label mounts (seconds on a slow phone while the first frames are heavy), so labels
 * mount as soon as the base is in and wait here, hidden, for `selectReady`. This component
 * subscribes to the store itself, so it flips in the same tick as the HUD instead of going through
 * `Html`'s re-render (#61).
 */
/** Style, not a class: `useFrame` toggles `fx-dim` on this node and a className re-render would wipe it. */
const HELD = { visibility: 'hidden' } as const;

function AnchorBox({ anchor, children }: { anchor: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const ready = useStore(selectReady);
  return (
    <div ref={anchor} className="fx-anchor" style={ready ? undefined : HELD}>
      {children}
    </div>
  );
}

/** Always-visible tag for the generator, shown for others only while selected. `pointer-events: none`. */
export function NameTag({ id, height, unit }: { id: BaseModuleId; height: number; unit: number }) {
  return (
    <Anchored id={id} height={height} unit={unit} lift={TAG_LIFT}>
      <div className="fx-tag">{moduleName(id)}</div>
    </Anchored>
  );
}

/** The sensor reading line, rewritten by this effect (not React) twice a second. */
function BadgeReading({ id, fault }: { id: BaseModuleId; fault: Fault }) {
  const reading = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = reading.current;
    if (!el) return;
    const update = () => {
      const now = selectServerNow(useStore.getState(), Date.now());
      el.textContent = sensorReading(id, sensorValue(id, fault, now));
    };
    update();
    const timer = setInterval(update, SENSOR_TICK_MS);
    return () => clearInterval(timer);
  }, [id, fault]);
  return <span ref={reading} className="fx-badge-reading" />;
}

/**
 * Two lines: what to do (`⚠ 발전기 고장 · 눌러서 수리`), then the sensor reading, small. The reading
 * is owned by this effect, not by React, so it can change every 0.5 s without a render. It lives in
 * its own component because `Html` renders in a separate root.
 */
function BadgeButton({
  id,
  fault,
  othersHolding,
  panelOpen,
}: {
  id: BaseModuleId;
  fault: Fault;
  othersHolding: boolean;
  panelOpen: boolean;
}) {
  return (
    <button type="button" className="fx-badge" onClick={(e) => selectModule(e, id)}>
      <span className="fx-badge-head">{badgeText(id, { othersHolding, panelOpen })}</span>
      {/* While this module's panel is open it shows the reading itself; two numbers a tick apart disagreed (#80). */}
      {panelOpen ? null : <BadgeReading id={id} fault={fault} />}
    </button>
  );
}

/** The one big, tappable label: tapping it selects the faulted module. */
export function FaultBadge({
  id,
  fault,
  height,
  unit,
  othersHolding,
}: {
  id: BaseModuleId;
  fault: Fault;
  height: number;
  /** Local units per world unit (1 / module scale), so the lift looks the same on every module. */
  unit: number;
  othersHolding: boolean;
}) {
  const panelOpen = useStore((s) => s.selected === id);
  return (
    <Anchored id={id} height={height} unit={unit} lift={BADGE_LIFT}>
      <BadgeButton id={id} fault={fault} othersHolding={othersHolding} panelOpen={panelOpen} />
    </Anchored>
  );
}

/** Small tappable `⚠ 거주 돔` for every broken module that does not have the big badge. */
export function FaultDot({ id, height, unit }: { id: BaseModuleId; height: number; unit: number }) {
  return (
    <Anchored id={id} height={height} unit={unit} lift={BADGE_LIFT}>
      <button
        type="button"
        className="fx-dot"
        aria-label={`${moduleName(id)} 고장`}
        onClick={(e) => selectModule(e, id)}
      >
        {dotText(id)}
      </button>
    </Anchored>
  );
}
