import { Html } from '@react-three/drei';
import type { MouseEvent } from 'react';
import { moduleName, type BaseModuleId } from '../../modules';
import { useStore } from '../../store';
import { badgeText } from './labelRules';
import './fx.css';

/** Name tags and the fault badge sit this far (world units) above the module's top. */
const LABEL_LIFT = 0.9;

/** Always-visible tag for the generator, shown for others only while selected. `pointer-events: none`. */
export function NameTag({ id, height, unit }: { id: BaseModuleId; height: number; unit: number }) {
  return (
    <Html position={[0, height + LABEL_LIFT * unit, 0]} center pointerEvents="none" zIndexRange={[0, 0]}>
      <div className="fx-tag">{moduleName(id)}</div>
    </Html>
  );
}

/**
 * The only tappable label: tapping it selects the faulted module. While that module's panel is open
 * it drops `· 눌러서 수리` (the panel's button says how).
 */
export function FaultBadge({
  id,
  height,
  unit,
  othersHolding,
  sensorText,
}: {
  id: BaseModuleId;
  height: number;
  /** Local units per world unit (1 / module scale), so the lift looks the same on every module. */
  unit: number;
  othersHolding: boolean;
  /** `formatSensor(...)`; the scene track updates it every 0.5 s without re-rendering per frame. */
  sensorText: string;
}) {
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    useStore.getState().select(id);
  };
  return (
    <Html position={[0, height + LABEL_LIFT * unit, 0]} center pointerEvents="none" zIndexRange={[0, 0]}>
      <button type="button" className="fx-badge" onClick={onClick}>
        {badgeText(id, { othersHolding, sensorText })}
      </button>
    </Html>
  );
}
