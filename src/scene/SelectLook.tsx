import { useEffect, useMemo, useRef } from 'react';
import { BackSide, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import type { BaseModuleId } from '../modules';
import { useStore } from '../store';
import { createRingMaterial, RING_GEOMETRY, setOpacity } from './fx/shared';
import { LOOK, SELECT_COLOR } from './look';

/** Fixed cyan ring on the floor under the selected module (separate from the red fault ring). */
export function SelectRing({ id, radius }: { id: BaseModuleId; radius: number }) {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => createRingMaterial(SELECT_COLOR), []);
  useEffect(() => () => material.dispose(), [material]);
  const s = radius * 1.2;
  useEffect(() => {
    setOpacity(material, 0.85);
    return useStore.subscribe((st) => {
      if (mesh.current) mesh.current.visible = st.selected === id;
    });
  }, [id, material]);
  return (
    <mesh
      ref={mesh}
      geometry={RING_GEOMETRY}
      material={material}
      rotation-x={-Math.PI / 2}
      position-y={0.04}
      scale={[s, s, 1]}
      visible={false}
      raycast={() => null}
    />
  );
}

const HULL_SCALE = 1.045;

/** Back faces only, the mesh scaled about its own bounding-box centre: no spikes at hard edges. */
function hullMaterial(geometry: Mesh['geometry']): MeshBasicMaterial {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const c = geometry.boundingBox!.getCenter(new Vector3());
  const m = new MeshBasicMaterial({ color: SELECT_COLOR, side: BackSide, toneMapped: false, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n vec3 hc = vec3(${c.x}, ${c.y}, ${c.z}); transformed = hc + (transformed - hc) * ${HULL_SCALE};`,
    );
  };
  m.customProgramCacheKey = () => `hull${c.x},${c.y},${c.z}`;
  return m;
}

/** Adds an inverted-hull outline to every mesh under `root`; only shown while `id` is selected. */
export function useHull(root: Object3D, id: BaseModuleId) {
  useEffect(() => {
    if (LOOK === 'none') return;
    const hulls: Mesh[] = [];
    root.traverse((o) => {
      if (!(o instanceof Mesh) || o.userData.hull) return;
      const h = new Mesh(o.geometry, hullMaterial(o.geometry));
      h.userData.hull = true;
      h.raycast = () => null;
      h.visible = false;
      o.add(h);
      hulls.push(h);
    });
    const apply = (sel: string | null) => hulls.forEach((h) => (h.visible = sel === id));
    apply(useStore.getState().selected);
    const unsub = useStore.subscribe((st) => apply(st.selected));
    return () => {
      unsub();
      hulls.forEach((h) => {
        h.parent?.remove(h);
        (h.material as MeshBasicMaterial).dispose();
      });
    };
  }, [root, id]);
}
