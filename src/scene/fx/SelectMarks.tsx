import { useEffect, useRef } from 'react';
import type { Mesh } from 'three';
import type { BaseModuleId } from '../../modules';
import { useStore } from '../../store';
import { selectRingRadius } from '../layout';
import { createRingMaterial, SELECT_COLOR, setOpacity, THIN_RING_GEOMETRY } from './shared';

/**
 * How the selected module shows that it is selected (plan 008 B.1, #91), drawn the same with or
 * without post-processing: a still ring on the floor here, and an inverted-hull outline round the
 * body (`hull.ts`). Both only flip `visible` on a selection change (store subscription, nothing per
 * frame).
 */

const RING_MATERIAL = createRingMaterial(SELECT_COLOR);
setOpacity(RING_MATERIAL, 0.9);

/**
 * A thin cyan ring just outside the tap box. It never moves: the red fault ring pulses outside it
 * (`layout.floorRingRange`), so a selected broken module shows both, apart in colour and motion.
 */
export function SelectRing({ id }: { id: BaseModuleId }) {
  const mesh = useRef<Mesh>(null);
  const r = selectRingRadius(id);
  useEffect(() => {
    const show = (selected: string | null) => {
      if (mesh.current) mesh.current.visible = selected === id;
    };
    show(useStore.getState().selected);
    return useStore.subscribe((s) => show(s.selected));
  }, [id]);
  return (
    <mesh
      ref={mesh}
      geometry={THIN_RING_GEOMETRY}
      material={RING_MATERIAL}
      rotation-x={-Math.PI / 2}
      position-y={0.03}
      scale={[r, r, 1]}
      visible={false}
      raycast={() => null}
    />
  );
}
