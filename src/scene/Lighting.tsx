import { Environment } from '@react-three/drei';
import { Suspense, useState } from 'react';
import { SceneErrorBoundary } from './ErrorBoundary';

const AMBIENT = 0.25;
const DIRECTIONAL = 2.2;
/** Used when the HDRI fails: the environment light is gone, so the direct lights carry the scene. */
const AMBIENT_NO_ENV = 0.9;
const DIRECTIONAL_NO_ENV = 3.2;

/**
 * Directional (the only shadow) + weak ambient + the HDRI for indirect light only (not the background).
 * If the HDRI cannot load, its boundary raises the direct lights instead of failing the scene.
 */
export function Lighting() {
  const [envFailed, setEnvFailed] = useState(false);
  return (
    <>
      <ambientLight intensity={envFailed ? AMBIENT_NO_ENV : AMBIENT} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={envFailed ? DIRECTIONAL_NO_ENV : DIRECTIONAL}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-bias={-0.0005}
      />
      <SceneErrorBoundary fallback={null} onError={() => setEnvFailed(true)}>
        <Suspense fallback={null}>
          <Environment files="/hdri/sky-512.hdr" />
        </Suspense>
      </SceneErrorBoundary>
    </>
  );
}
