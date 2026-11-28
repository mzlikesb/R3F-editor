import { useGLTF } from '@react-three/drei';
import { Suspense, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Box3, Color, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3, type Group } from 'three';
import type { BaseModuleId } from '../modules';
import { useStore } from '../store';
import { SceneErrorBoundary } from './ErrorBoundary';
import { ModuleFx } from './fx/ModuleFx';
import { isHull, useHull } from './fx/hull';
import { SelectRing } from './fx/SelectMarks';
import { LAYOUT, MODEL_BOUNDS } from './layout';
import { pickTap, type TapHit } from './tapPick';
import type { ModuleHandle } from './moduleTypes';
import './scene.css';

const DRACO = '/draco/';
const FALLBACK_COLOR = new Color('#6f8296');
const METALNESS = 0.3;
const ROUGHNESS = 0.7;
/**
 * The greenhouse and the habitat dome are the same hangar model; a tint on their own material clones
 * tells them apart without a name tag (neon): green glass for the greenhouse, warm for the dome.
 */
const TINT: Partial<Record<BaseModuleId, Color>> = {
  greenhouse: new Color('#a9e8b4'),
  habitat: new Color('#ffc890'),
};

export interface ModuleProps {
  id: BaseModuleId;
  position?: readonly [number, number, number];
  scale?: number;
  rotationY?: number;
}

/**
 * One module: a positioned/scaled group holding the model (GLB, or a plain shape if it fails to
 * load), the `feel` track's `ModuleFx`, the selection ring, and an invisible tap box. Each module has its own Suspense
 * and error boundary, so one slow or broken GLB does not touch the others.
 */
export function Module({ id, position, scale, rotationY }: ModuleProps) {
  const layout = LAYOUT[id];
  const [handle, setHandle] = useState<ModuleHandle | null>(null);
  return (
    <group
      position={position ?? [layout.x, 0, layout.z]}
      scale={scale ?? layout.scale}
      rotation={[0, rotationY ?? layout.rotationY, 0]}
    >
      <SceneErrorBoundary fallback={<FallbackModel id={id} onHandle={setHandle} />}>
        <Suspense fallback={null}>
          <GltfModel id={id} onHandle={setHandle} />
        </Suspense>
      </SceneErrorBoundary>
      <ModuleFx id={id} handle={handle} />
      <SelectRing id={id} />
      <TapBox id={id} />
    </group>
  );
}

interface ModelProps {
  id: BaseModuleId;
  onHandle: (handle: ModuleHandle) => void;
}

function GltfModel({ id, onHandle }: ModelProps) {
  const { scene } = useGLTF(`/models/${id}.glb`, DRACO);
  const { object, materials } = useMemo(() => {
    const clone = scene.clone(true);
    const own: MeshStandardMaterial[] = [];
    clone.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.raycast = () => null; // taps go to the tap box
      o.castShadow = true;
      o.receiveShadow = true;
      const m = (o.material as MeshStandardMaterial).clone();
      initMaterial(m);
      const tint = TINT[id];
      if (tint) m.color.multiply(tint);
      o.material = m;
      own.push(m);
    });
    return { object: clone, materials: own };
  }, [scene, id]);
  const group = useRef<Group>(null);
  useHandle(group, materials, onHandle);
  useHull(object, id);
  return (
    <group ref={group}>
      <primitive object={object} />
    </group>
  );
}

/** The M1 generator cube for the generator, a plain cylinder for the others. */
function FallbackModel({ id, onHandle }: ModelProps) {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: FALLBACK_COLOR });
    initMaterial(m);
    return m;
  }, []);
  const materials = useMemo(() => [material], [material]);
  const group = useRef<Group>(null);
  useHandle(group, materials, onHandle);
  return (
    <group ref={group}>
      <mesh position={[0, 0.5, 0]} castShadow raycast={() => null} material={material}>
        {id === 'generator' ? <boxGeometry /> : <cylinderGeometry args={[0.5, 0.6, 1, 16]} />}
      </mesh>
    </group>
  );
}

/** Material setup done once; `feel` owns emissive from here on. */
function initMaterial(m: MeshStandardMaterial) {
  m.metalness = METALNESS;
  m.roughness = ROUGHNESS;
  m.emissive.set(0x000000);
  m.emissiveIntensity = 0;
}

const box = new Box3();
const part = new Box3();
const size = new Vector3();
const toModel = new Matrix4();
const rel = new Matrix4();

/**
 * Bounds in the model group's own space (= the module group's local units, where `ModuleFx` draws).
 * Not `Box3.setFromObject`: that is in world space and depends on whether the parent's world matrix
 * has been updated yet (a fallback swapped in after a frame would get scaled bounds).
 */
function localBounds(model: Group): Box3 {
  model.updateWorldMatrix(true, true);
  toModel.copy(model.matrixWorld).invert();
  box.makeEmpty();
  model.traverse((o) => {
    if (!(o instanceof Mesh) || isHull(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    part.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(toModel, o.matrixWorld));
    box.union(part);
  });
  return box;
}

/** Builds the handle for `feel` once the model group is in the scene. */
function useHandle(
  group: RefObject<Group | null>,
  materials: readonly MeshStandardMaterial[],
  onHandle: (handle: ModuleHandle) => void,
) {
  useLayoutEffect(() => {
    const model = group.current;
    if (!model) return;
    const b = localBounds(model);
    b.getSize(size);
    onHandle({ model, materials, height: b.max.y, radius: Math.max(size.x, size.z) / 2 });
  }, [group, materials, onHandle]);
}

const TAP_MATERIAL = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/**
 * Picks from everything under the pointer (`e.intersections`, nearest first), not just the box that
 * was hit first: a margin box can stand in front of another module's model (`scene/tapPick.ts`).
 */
function onTap(e: ThreeEvent<MouseEvent>) {
  e.stopPropagation();
  const hits = e.intersections
    .map((i) => i.object.userData as Partial<TapHit>)
    .filter((d): d is TapHit => d.moduleId !== undefined && d.part !== undefined);
  const id = pickTap(hits);
  if (id) useStore.getState().select(id);
}

/**
 * Two invisible boxes, the only things in a module that take taps: `body` over the model and a
 * generous `margin` around it for fingers. Neither is drawn (`visible={false}`).
 */
function TapBox({ id }: { id: BaseModuleId }) {
  const { tapHalf, tapHeight } = LAYOUT[id];
  const body = MODEL_BOUNDS[id];
  const bodyHit: TapHit = useMemo(() => ({ moduleId: id, part: 'body' }), [id]);
  const marginHit: TapHit = useMemo(() => ({ moduleId: id, part: 'margin' }), [id]);
  return (
    <>
      <mesh
        visible={false}
        position={[0, body.height / 2, 0]}
        userData={bodyHit}
        material={TAP_MATERIAL}
        onClick={onTap}
      >
        <boxGeometry args={[body.halfX * 2, body.height, body.halfZ * 2]} />
      </mesh>
      <mesh
        visible={false}
        position={[0, tapHeight / 2, 0]}
        userData={marginHit}
        material={TAP_MATERIAL}
        onClick={onTap}
      >
        <boxGeometry args={[tapHalf[0] * 2, tapHeight, tapHalf[2] * 2]} />
      </mesh>
    </>
  );
}
