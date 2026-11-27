import { Html } from '@react-three/drei';
import type { MouseEvent } from 'react';
import { moduleName, type BaseModuleId } from '../../modules';
import { useStore } from '../../store';
import './fx.css';

/** Name tags and the fault badge sit this far above the module's top. */
const LABEL_LIFT = 0.45;

/** Always-visible tag for the generator, shown for others only while selected. `pointer-events: none`. */
export function NameTag({ id, height }: { id: BaseModuleId; height: number }) {
  return (
    <Html position={[0, height + LABEL_LIFT, 0]} center pointerEvents="none" zIndexRange={[0, 0]}>
      <div className="fx-tag">{moduleName(id)}</div>
    </Html>
  );
}

/** The only tappable label: tapping it selects the faulted module. */
export function FaultBadge({ id, height }: { id: BaseModuleId; height: number }) {
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    useStore.getState().select(id);
  };
  return (
    <Html position={[0, height + LABEL_LIFT, 0]} center pointerEvents="none" zIndexRange={[0, 0]}>
      <button type="button" className="fx-badge" onClick={onClick}>
        ⚠ {moduleName(id)} 고장 · 눌러서 수리
      </button>
    </Html>
  );
}
