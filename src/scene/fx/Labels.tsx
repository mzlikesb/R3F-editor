import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { sensorReading, sensorValue } from '../../../shared/sensors';
import type { Fault } from '../../../shared/protocol';
import { moduleName, type BaseModuleId } from '../../modules';
import { selectServerNow, useStore } from '../../store';
import { isLabelOccluded } from './labelOcclusion';
import { badgeText, dotText } from './labelRules';
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
  useFrame(({ camera }) => {
    const el = anchor.current;
    if (!el) return;
    const next =
      useStore.getState().selected !== id &&
      isLabelOccluded(id, camera.position.x, camera.position.y, camera.position.z);
    if (next === dim.current) return;
    dim.current = next;
    el.classList.toggle('fx-dim', next);
  });
  return (
    <Html position={[0, height + lift * unit, 0]} pointerEvents="none" zIndexRange={[0, 0]}>
      <div ref={anchor} className="fx-anchor">
        {children}
      </div>
    </Html>
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
  return (
    <button type="button" className="fx-badge" onClick={(e) => selectModule(e, id)}>
      <span className="fx-badge-head">{badgeText(id, { othersHolding, panelOpen })}</span>
      <span ref={reading} className="fx-badge-reading" />
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
