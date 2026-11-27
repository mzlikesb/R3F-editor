import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import { selectBlackout, useStore } from '../store';
import { MODULES } from '../modules';
import { CameraRig } from './CameraRig';
import { Ground } from './Ground';
import { OVERVIEW_START } from './layout';
import { LabelPlanProvider } from './fx/LabelPlanProvider';
import { Lighting } from './Lighting';
import { Module } from './Module';
import { PERF_ENABLED } from './perf';
import { PerfHud } from './PerfHud';
import { Rocks } from './Rocks';
import { SKY_GRADIENT, SKY_GRADIENT_DARK, Stars } from './Sky';
import { isTap } from './tap';

/**
 * The canvas and everything in it: sky, lights, HDRI, ground, rocks, modules, camera, tap-vs-drag,
 * `?perf` HUD (plan 005 A, E).
 */
export function BaseCanvas() {
  const down = useRef({ x: 0, y: 0 });
  const blackout = useStore(selectBlackout);
  return (
    <div className="sky-root" style={{ background: SKY_GRADIENT }}>
      <div className="sky-dark" style={{ background: SKY_GRADIENT_DARK, opacity: blackout ? 1 : 0 }} />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [...OVERVIEW_START], fov: 50, near: 0.5, far: 400 }}
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMissed={(e) => {
          // Letting go after an orbit drag is not a tap on empty space.
          if (isTap(down.current, { x: e.clientX, y: e.clientY })) useStore.getState().select(null);
        }}
      >
        <Stars />
        <Lighting />
        <Ground />
        <Rocks />
        <LabelPlanProvider>
          {MODULES.map((m) => (
            <Module key={m.id} id={m.id} />
          ))}
        </LabelPlanProvider>
        <CameraRig />
        {PERF_ENABLED && <PerfHud />}
      </Canvas>
    </div>
  );
}
