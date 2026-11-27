import { Environment } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import type { AmbientLight, DirectionalLight } from 'three';
import { selectBlackout, useStore } from '../store';
import { EmergencyLight } from './EmergencyLight';
import { SceneErrorBoundary } from './ErrorBoundary';
import { SHADOW_MAP_SIZE } from './quality';
import { getTier } from './qualityStore';

const AMBIENT = 0.25;
const DIRECTIONAL = 2.2;
/** Used when the HDRI fails: the environment light is gone, so the direct lights carry the scene. */
const AMBIENT_NO_ENV = 0.9;
const DIRECTIONAL_NO_ENV = 3.2;
/** Share of the daylight kept during a blackout. */
const BLACKOUT_LEVEL = 0.12;
/** How fast the light follows the blackout (per second). The return is slower, so relighting is seen. */
const DIM_RATE = 5;
const RESTORE_RATE = 2.5;

/**
 * Directional (the only shadow) + weak ambient + the HDRI for indirect light only (not the background).
 * If the HDRI cannot load, its boundary raises the direct lights instead of failing the scene.
 */
export function Lighting() {
  // Fixed by the device tier for the session: changing it would rebuild the shadow map.
  const shadowSize = SHADOW_MAP_SIZE[getTier()];
  const [envFailed, setEnvFailed] = useState(false);
  const level = useRef(1);
  const ambient = useRef<AmbientLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const ambientBase = envFailed ? AMBIENT_NO_ENV : AMBIENT;
  const sunBase = envFailed ? DIRECTIONAL_NO_ENV : DIRECTIONAL;

  useFrame(({ scene }, delta) => {
    const dark = selectBlackout(useStore.getState());
    const target = dark ? BLACKOUT_LEVEL : 1;
    const rate = dark ? DIM_RATE : RESTORE_RATE;
    level.current += (target - level.current) * Math.min(1, delta * rate);
    if (ambient.current) ambient.current.intensity = ambientBase * level.current;
    if (sun.current) sun.current.intensity = sunBase * level.current;
    // The HDRI lights the ground and rocks more than the direct lights do; without this the blackout
    // barely darkens them. Written every frame, so `Environment` re-applying 1 on a render is undone.
    scene.environmentIntensity = level.current;
  });

  return (
    <>
      <EmergencyLight />
      <ambientLight ref={ambient} intensity={ambientBase} />
      <directionalLight
        ref={sun}
        position={[10, 16, 8]}
        intensity={sunBase}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
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
