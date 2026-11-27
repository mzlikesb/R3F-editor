import { Html } from '@react-three/drei';
import { useLayoutEffect, useRef, type MouseEvent } from 'react';
import { formatSensor, sensorValue } from '../../../shared/sensors';
import type { Fault } from '../../../shared/protocol';
import { moduleName, type BaseModuleId } from '../../modules';
import { selectServerNow, useStore } from '../../store';
import { badgeText } from './labelRules';
import './fx.css';

/** Name tags and the fault badge sit this far (world units) above the module's top. */
const LABEL_LIFT = 0.9;
/** The badge's sensor number is rewritten this often (ms), straight into the DOM. */
const SENSOR_TICK_MS = 500;

function selectModule(e: MouseEvent, id: BaseModuleId) {
  e.stopPropagation();
  useStore.getState().select(id);
}

/** Always-visible tag for the generator, shown for others only while selected. `pointer-events: none`. */
export function NameTag({ id, height, unit }: { id: BaseModuleId; height: number; unit: number }) {
  return (
    <Html position={[0, height + LABEL_LIFT * unit, 0]} center pointerEvents="none" zIndexRange={[0, 0]}>
      <div className="fx-tag">{moduleName(id)}</div>
    </Html>
  );
}

/**
 * The text is owned by this effect, not by React, so the sensor number can change every 0.5 s
 * without a render. It lives in its own component because `Html` renders in a separate root.
 */
function BadgeButton({ id, fault, othersHolding }: { id: BaseModuleId; fault: Fault; othersHolding: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const now = selectServerNow(useStore.getState(), Date.now());
      const sensorText = formatSensor(id, sensorValue(id, fault, now));
      el.textContent = badgeText(id, { othersHolding, sensorText });
    };
    update();
    const timer = setInterval(update, SENSOR_TICK_MS);
    return () => clearInterval(timer);
  }, [id, fault, othersHolding]);
  return <button ref={ref} type="button" className="fx-badge" onClick={(e) => selectModule(e, id)} />;
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
  return (
    <Html position={[0, height + LABEL_LIFT * unit, 0]} center pointerEvents="none" zIndexRange={[0, 0]}>
      <BadgeButton id={id} fault={fault} othersHolding={othersHolding} />
    </Html>
  );
}

/** Small tappable `⚠` for every broken module that does not have the big badge. */
export function FaultDot({ id, height, unit }: { id: BaseModuleId; height: number; unit: number }) {
  return (
    <Html position={[0, height + LABEL_LIFT * unit, 0]} center pointerEvents="none" zIndexRange={[0, 0]}>
      <button
        type="button"
        className="fx-dot"
        aria-label={`${moduleName(id)} 고장`}
        onClick={(e) => selectModule(e, id)}
      >
        ⚠
      </button>
    </Html>
  );
}
