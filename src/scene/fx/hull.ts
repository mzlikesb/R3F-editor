import { useEffect } from 'react';
import {
  AlwaysStencilFunc,
  BackSide,
  Box3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import type { BaseModuleId } from '../../modules';
import { useStore } from '../../store';
import { SELECT_COLOR } from './shared';

/** What the selected module's body writes to the stencil buffer. */
const STENCIL_REF = 1;

/** Outline thickness: the hull is the whole model grown this much about the model's bounding-box centre. */
const HULL_SCALE = 1.045;

/**
 * One material for every hull. Back faces only, so the model covers the hull except at its rim.
 * Transparent (drawn after every opaque object, so the ground behind cannot paint over the rim) but
 * fully opaque in colour; no depth write; tone mapped like the scene; under the Bloom threshold.
 * Drawn only where the selected body did not mark the stencil: the silhouette is left, and the
 * bands where a stacked part's hull pokes out past the part above it (the generator) are gone.
 */
const HULL_MATERIAL = new MeshBasicMaterial({
  color: SELECT_COLOR,
  side: BackSide,
  transparent: true,
  opacity: 1,
  depthWrite: false,
  toneMapped: true,
  fog: false,
  stencilWrite: true,
  stencilRef: STENCIL_REF,
  stencilFunc: NotEqualStencilFunc,
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
 * material. All of them grow by the same scale about the centre of the whole model (every GLB here
 * is one mesh today, so this is the mesh centre), and no shader is patched. Each hull's matrix is `M⁻¹ · S · M`: `M` is its mesh relative to `root`, `S` the scale
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
    // The body marks the stencil while selected (a state flag: no shader recompiles).
    const bodies: Material[] = meshes.flatMap((o) => o.material);
    for (const m of bodies) {
      m.stencilRef = STENCIL_REF;
      m.stencilFunc = AlwaysStencilFunc;
      m.stencilZPass = ReplaceStencilOp;
    }
    const show = (selected: string | null) => {
      for (const h of hulls) h.visible = selected === id;
      for (const m of bodies) m.stencilWrite = selected === id;
    };
    show(useStore.getState().selected);
    const unsubscribe = useStore.subscribe((s) => show(s.selected));
    return () => {
      unsubscribe();
      for (const h of hulls) h.removeFromParent();
      for (const m of bodies) m.stencilWrite = false;
    };
  }, [root, id]);
}
