import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useStore } from '../store';
import { Generator } from './Generator';

/**
 * The canvas and everything in it: background, lights, HDRI, ground, rocks, modules, camera
 * controls, tap-vs-drag, `?perf` HUD (plan 005 A, E). Track `scene`. Until then it is the M1 scene.
 */
export function BaseCanvas() {
  return (
    <Canvas camera={{ position: [3, 2.5, 4], fov: 50 }} onPointerMissed={() => useStore.getState().select(null)}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <Generator />
      <OrbitControls makeDefault />
    </Canvas>
  );
}
