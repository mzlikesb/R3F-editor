import { useEffect } from 'react';
import { BackSide, Box3, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import type { BaseModuleId } from '../../modules';
import { useStore } from '../../store';
import { SELECT_COLOR } from './shared';

/** Outline thickness: the hull is the whole model grown this much about the model's bounding-box centre. */
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
const box = new Box3();
const part = new Box3();
const toRoot = new Matrix4();
const rel = new Matrix4();
const grow = new Matrix4();

/** True for a hull mesh: `Module` skips them when it measures the model. */
export function isHull(o: Object3D): boolean {
  return o.userData.hull === true;
}

/**
 * Adds an inverted-hull outline under every mesh of `root` (the GLB clone: model meshes only, no
 * effects), shown only while `id` is selected. Every hull shares its mesh's geometry and the one
 * material. All of them grow by the same scale about the centre of the whole model, so stacked
 * parts make one outline instead of a step per part (#104 QA: the generator's plates), and no shader
 * is patched. Each hull's matrix is `M⁻¹ · S · M`: `M` is its mesh relative to `root`, `S` the scale
 * about the model centre in `root` space.
 */
export function useHull(root: Object3D, id: BaseModuleId) {
  useEffect(() => {
    // Collect first, then attach: the new meshes must not be visited.
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof Mesh && !isHull(o)) meshes.push(o);
    });
    root.updateWorldMatrix(true, true);
    toRoot.copy(root.matrixWorld).invert();
    box.makeEmpty();
    for (const o of meshes) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      part.copy(o.geometry.boundingBox!).applyMatrix4(rel.multiplyMatrices(toRoot, o.matrixWorld));
      box.union(part);
    }
    box.getCenter(center);
    grow
      .makeTranslation(center.x, center.y, center.z)
      .multiply(new Matrix4().makeScale(HULL_SCALE, HULL_SCALE, HULL_SCALE))
      .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    const hulls = meshes.map((o) => {
      const h = new Mesh(o.geometry, HULL_MATERIAL);
      h.userData.hull = true;
      h.raycast = () => null;
      h.visible = false;
      rel.multiplyMatrices(toRoot, o.matrixWorld);
      h.matrixAutoUpdate = false;
      h.matrix.copy(rel).invert().multiply(grow).multiply(rel);
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
