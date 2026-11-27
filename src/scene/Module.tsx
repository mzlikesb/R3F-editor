import { useGLTF } from '@react-three/drei';
import { Suspense, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3, type Group } from 'three';
import type { BaseModuleId } from '../modules';
import { useStore } from '../store';
import { SceneErrorBoundary } from './ErrorBoundary';
import { ModuleFx } from './fx/ModuleFx';
import { LAYOUT } from './layout';
import type { ModuleHandle } from './moduleTypes';
import './scene.css';

const DRACO = '/draco/';
const FALLBACK_COLOR = new Color('#6f8296');
const METALNESS = 0.3;
const ROUGHNESS = 0.7;

export interface ModuleProps {
  id: BaseModuleId;
  position?: readonly [number, number, number];
  scale?: number;
  rotationY?: number;
}

/**
 * One module: a positioned/scaled group holding the model (GLB, or a plain shape if it fails to
 * load), the `feel` track's `ModuleFx`, and an invisible tap box. Each module has its own Suspense
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
      o.material = m;
      own.push(m);
    });
    return { object: clone, materials: own };
  }, [scene]);
  const group = useRef<Group>(null);
  useHandle(group, materials, onHandle);
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
const size = new Vector3();

/** Builds the handle for `feel` once the model group is in the scene. */
function useHandle(
  group: RefObject<Group | null>,
  materials: readonly MeshStandardMaterial[],
  onHandle: (handle: ModuleHandle) => void,
) {
  useLayoutEffect(() => {
    const model = group.current;
    if (!model) return;
    box.setFromObject(model);
    box.getSize(size);
    onHandle({ model, materials, height: box.max.y, radius: Math.max(size.x, size.z) / 2 });
  }, [group, materials, onHandle]);
}

/** Generous invisible box; the only thing in a module that takes taps. */
function TapBox({ id }: { id: BaseModuleId }) {
  const { tapHalf, tapHeight } = LAYOUT[id];
  return (
    <mesh
      visible={false}
      position={[0, tapHeight / 2, 0]}
      onClick={(e) => {
        e.stopPropagation();
        useStore.getState().select(id);
      }}
    >
      <boxGeometry args={[tapHalf[0] * 2, tapHeight, tapHalf[2] * 2]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
}
