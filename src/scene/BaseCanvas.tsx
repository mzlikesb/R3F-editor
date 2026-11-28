import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import { useStore } from '../store';
import { MODULES } from '../modules';
import { AsteroidBelt } from './AsteroidBelt';
import { CameraRig } from './CameraRig';
import { Ground } from './Ground';
import { OVERVIEW_START } from './layout';
import { LabelPlanProvider } from './fx/LabelPlanProvider';
import { Lighting } from './Lighting';
import { Module } from './Module';
import { PERF_ENABLED } from './perf';
import { PerfHud } from './PerfHud';
import { QualityController } from './QualityController';
import { useQuality } from './qualityStore';
import { RockField } from './RockField';
import { Rocks } from './Rocks';
import { SolarPanels } from './SolarPanels';
import { SceneTone } from './SceneTone';
import { Stars } from './Sky';
import { isTap } from './tap';

/**
 * The canvas and everything in it: sky and fog, asteroid belt, lights, HDRI, ground, rocks, solar panels,
 * modules, camera, tap-vs-drag, `?perf` HUD (plan 005 A, E), adaptive quality (plan 007 C).
 */
export function BaseCanvas() {
  const down = useRef({ x: 0, y: 0 });
  // The prop, not `setDpr`: a re-render of `Canvas` resets dpr to whatever the prop says.
  const dpr = useQuality((s) => s.dpr);
  return (
    <div className="sky-root">
      <Canvas
        shadows
        dpr={dpr}
        camera={{ position: [...OVERVIEW_START], fov: 50, near: 0.5, far: 400 }}
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMissed={(e) => {
          // Letting go after an orbit drag is not a tap on empty space.
          if (isTap(down.current, { x: e.clientX, y: e.clientY })) useStore.getState().select(null);
        }}
      >
        {/* First: it steps the blackout fade the lights read this frame. */}
        <SceneTone />
        <Stars />
        <Lighting />
        <Ground />
        <Rocks />
        <RockField />
        <SolarPanels />
        <AsteroidBelt />
        <LabelPlanProvider>
          {MODULES.map((m) => (
            <Module key={m.id} id={m.id} />
          ))}
        </LabelPlanProvider>
        <CameraRig />
        <QualityController />
        {PERF_ENABLED && <PerfHud />}
      </Canvas>
    </div>
  );
}
