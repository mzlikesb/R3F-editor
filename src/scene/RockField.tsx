import { Detailed, useGLTF } from '@react-three/drei';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import { selectReady, useStore } from '../store';
import { SceneErrorBoundary } from './ErrorBoundary';
import { fillInstances } from './instances';
import { useQuality } from './qualityStore';
import { LOD_DISTANCE, ROCK_CELLS, ROCK_KINDS, type Rock, type RockCell, type RockKind } from './rockCells';

const DRACO = '/draco/';
const noRaycast = () => null;

interface Look {
  geometry: BufferGeometry;
  material: Material;
}

function firstMesh(scene: Object3D): Mesh {
  let found: Mesh | null = null;
  scene.traverse((o) => {
    if (!found && o instanceof Mesh) found = o;
  });
  if (!found) throw new Error('rock model has no mesh');
  return found;
}

/**
 * Near: each model's own geometry and material. Far: the simplified meshes
 * (`scripts/compress.sh --lod`) with one flat shaded material in the small rocks' colour.
 */
function useLooks(): Record<'near' | 'far', Record<RockKind, Look>> {
  const gltfs = useGLTF(
    ROCK_KINDS.flatMap((k) => [`/models/${k}.glb`, `/models/${k}-low.glb`]),
    DRACO,
  );
  return useMemo(() => {
    const meshes = gltfs.map((g) => firstMesh(g.scene));
    const near = (m: Mesh) => {
      const material = (m.material as MeshStandardMaterial).clone();
      material.metalness = 0.1;
      material.roughness = 1;
      return { geometry: m.geometry, material };
    };
    const small = meshes[2]!.material as MeshStandardMaterial;
    const far = new MeshStandardMaterial({ color: small.color, flatShading: true, metalness: 0.1, roughness: 1 });
    return {
      near: { 'rock-a': near(meshes[0]!), 'rocks-small': near(meshes[2]!) },
      far: {
        'rock-a': { geometry: meshes[1]!.geometry, material: far },
        'rocks-small': { geometry: meshes[3]!.geometry, material: far },
      },
    };
  }, [gltfs]);
}

/** One kind in one cell at one level: one draw call. Matrices and bounds are written once. */
function CellMesh({ look, rocks }: { look: Look; rocks: readonly Rock[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    fillInstances(
      ref.current,
      rocks.map((r) => ({
        x: r.x,
        y: 0,
        z: r.z,
        rx: 0,
        ry: r.rotationY,
        rz: 0,
        sx: r.scale,
        sy: r.scale,
        sz: r.scale,
      })),
    );
  }, [rocks]);
  // Receives shadows but casts none: no rock in the shadow pass (mobile cost, plan 007 A.3).
  return (
    <instancedMesh ref={ref} args={[look.geometry, look.material, rocks.length]} receiveShadow raycast={noRaycast} />
  );
}

function Cell({ cell, looks }: { cell: RockCell; looks: ReturnType<typeof useLooks> }) {
  const outerVisible = useQuality((s) => s.outerRocksVisible);
  const byKind = useMemo(() => ROCK_KINDS.map((k) => [k, cell.rocks.filter((r) => r.kind === k)] as const), [cell]);
  const level = (lv: 'near' | 'far') => (
    <group>
      {byKind.map(([k, rocks]) => rocks.length > 0 && <CellMesh key={k} look={looks[lv][k]} rocks={rocks} />)}
    </group>
  );
  // Quality stage 4 hides the outer ring. Not `count = 0`: three still issues a draw call for that.
  return (
    <Detailed
      distances={[0, LOD_DISTANCE]}
      hysteresis={0.1}
      position={[cell.center.x, 0, cell.center.z]}
      visible={cell.ring === 'inner' || outerVisible}
    >
      {level('near')}
      {level('far')}
    </Detailed>
  );
}

function Field() {
  const looks = useLooks();
  return ROCK_CELLS.map((c) => <Cell key={`${c.ring}-${c.sector}`} cell={c} looks={looks} />);
}

/**
 * About 1,500 instanced rocks (plan 007 A.3, A.5, B.8): 8 cells (2 rings x 4 headings), each an LOD
 * of two levels with one InstancedMesh per kind, so 16 draw calls at most. They never take taps.
 */
export function RockField() {
  const ready = useStore(selectReady);
  return (
    <SceneErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        {/* Hidden with the rest of the loading state (`selectReady`), like the panel field. */}
        <group visible={ready}>
          <Field />
        </group>
      </Suspense>
    </SceneErrorBoundary>
  );
}
