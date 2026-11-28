import { useEffect } from 'react';
import { BackSide, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import type { BaseModuleId } from '../../modules';
import { useStore } from '../../store';
import { SELECT_COLOR } from './shared';

/** Outline thickness: the hull is the mesh grown this much about its own bounding-box centre. */
const HULL_SCALE = 1.045;

/**
 * One material for every hull. Back faces only, so the model covers the hull except at its rim.
 * Transparent (drawn after every opaque object, so the ground behind cannot paint over the rim) but
 * fully opaque in colour; no depth write; tone mapped like the scene; under the Bloom threshold.
 */
const HULL_MATERIAL = new MeshBasicMaterial({
  color: SELECT_COLOR,
  side: BackSide,
  transparent: true,
  opacity: 1,
  depthWrite: false,
  toneMapped: true,
  fog: false,
});

const center = new Vector3();

/** True for a hull mesh: `Module` skips them when it measures the model. */
export function isHull(o: Object3D): boolean {
  return o.userData.hull === true;
}

/**
 * Adds an inverted-hull outline under every mesh of `root` (the GLB clone: model meshes only, no
 * effects), shown only while `id` is selected. Each hull shares its mesh's geometry and is placed
 * by its own transform, `x -> c + (x - c) * s` about the geometry's centre `c`, so hard edges do
 * not split apart (#99) and no shader is patched.
 */
export function useHull(root: Object3D, id: BaseModuleId) {
  useEffect(() => {
    // Collect first, then attach: the new meshes must not be visited.
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof Mesh && !isHull(o)) meshes.push(o);
    });
    const hulls = meshes.map((o) => {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      g.boundingBox!.getCenter(center);
      const h = new Mesh(g, HULL_MATERIAL);
      h.userData.hull = true;
      h.raycast = () => null;
      h.visible = false;
      h.scale.setScalar(HULL_SCALE);
      h.position.copy(center).multiplyScalar(1 - HULL_SCALE);
      o.add(h);
      return h;
    });
    const show = (selected: string | null) => {
      for (const h of hulls) h.visible = selected === id;
    };
    show(useStore.getState().selected);
    const unsubscribe = useStore.subscribe((s) => show(s.selected));
    return () => {
      unsubscribe();
      for (const h of hulls) h.removeFromParent();
    };
  }, [root, id]);
}
