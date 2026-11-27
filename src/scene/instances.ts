import { type InstancedMesh, Object3D } from 'three';

/** One instance: position, Euler rotation (XYZ) and per-axis scale. */
export interface InstanceTransform {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
}

const tmp = new Object3D();

/**
 * Writes every instance matrix once, then the bounding sphere (plan 007 A.5): `setMatrixAt` alone
 * leaves the sphere of one model at the mesh origin, so culling and LOD distances would be wrong.
 */
export function fillInstances(mesh: InstancedMesh, items: readonly InstanceTransform[]): void {
  items.forEach((t, i) => {
    tmp.position.set(t.x, t.y, t.z);
    tmp.rotation.set(t.rx, t.ry, t.rz);
    tmp.scale.set(t.sx, t.sy, t.sz);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
