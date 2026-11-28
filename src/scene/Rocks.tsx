import { useGLTF } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import { Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { SceneErrorBoundary } from './ErrorBoundary';
import { PROPS, type Prop } from './layout';

const DRACO = '/draco/';
/** Multiplies the crater texture: pulls its rim and wall toward the ground colour, lowering their contrast. */
const CRATER_TINT = '#838a87';

function PropModel({ prop }: { prop: Prop }) {
  const { scene } = useGLTF(`/models/${prop.model}.glb`, DRACO);
  const object = useMemo<Object3D>(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.raycast = () => null; // scenery never takes taps
      o.castShadow = prop.model !== 'crater';
      o.receiveShadow = true;
      const m = o.material as MeshStandardMaterial;
      m.metalness = 0.1;
      m.roughness = 1;
      // A crater is floor, not something to tap: its texture is pale pink and read as a structure
      // against the dark ground (neon, phone-casual, #103). Multiplied down toward the ground tone.
      if (prop.model === 'crater') m.color.set(CRATER_TINT);
    });
    return clone;
  }, [scene, prop.model]);
  return (
    <primitive
      object={object}
      position={[prop.x, prop.model === 'crater' ? 0.02 : 0, prop.z]}
      scale={prop.scale}
      rotation={[0, prop.rotationY, 0]}
    />
  );
}

/** Rocks and craters. One boundary for all of them: if they fail the base simply has less scenery. */
export function Rocks() {
  return (
    <SceneErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        {PROPS.map((p) => (
          <PropModel key={`${p.model}-${p.x}-${p.z}`} prop={p} />
        ))}
      </Suspense>
    </SceneErrorBoundary>
  );
}
