import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import { useStore } from '../store';
import { MODULES } from '../modules';
import { AsteroidBelt } from './AsteroidBelt';
import { CameraRig } from './CameraRig';
import { CameraShake } from './CameraShake';
import { Ground } from './Ground';
import { OVERVIEW_START } from './layout';
import { LabelPlanProvider } from './fx/LabelPlanProvider';
import { Lighting } from './Lighting';
import { Module } from './Module';
import { PartPiece } from './PartPiece';
import { PresenceLights } from './PresenceLights';
import { PERF_ENABLED } from './perf';
import { PerfHud } from './PerfHud';
import { PostLayer } from './PostLayer';
import { QualityController } from './QualityController';
import { useQuality } from './qualityStore';
import { RockField } from './RockField';
import { Rocks } from './Rocks';
import { SolarPanels } from './SolarPanels';
import { SceneTone } from './SceneTone';
import { Stars } from './Sky';
import { actOnTap, pieceOnScreen } from './sceneTap';
import { isTap } from './tap';
import { tapTarget } from './tapPick';
import { useReducedMotion } from './useReducedMotion';

/**
 * The canvas and everything in it: sky and fog, asteroid belt, lights, HDRI, ground, rocks, solar panels,
 * modules, the parts piece, camera, tap-vs-drag, `?perf` HUD (plan 005 A, E), adaptive quality (plan 007 C), and the
 * post-processing composer when the session has one (plan 008 B.3, `PostLayer`).
 */
export function BaseCanvas() {
  const down = useRef({ x: 0, y: 0 });
  // The prop, not `setDpr`: a re-render of `Canvas` resets dpr to whatever the prop says.
  const dpr = useQuality((s) => s.dpr);
  const reducedMotion = useReducedMotion();
  return (
    <div className="sky-root">
      <Canvas
        shadows
        // Stencil: the selection outline stays outside the selected body (`fx/hull.ts`).
        gl={{ stencil: true }}
        dpr={dpr}
        camera={{ position: [...OVERVIEW_START], fov: 50, near: 0.5, far: 400 }}
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMissed={(e) => {
          // Letting go after an orbit drag is not a tap on empty space.
          if (!isTap(down.current, { x: e.clientX, y: e.clientY })) return;
          // Just off the piece, or where it just was, is still about the piece (009-2 playtest).
          const el = e.target instanceof Element ? e.target : null;
          const target = tapTarget([], el ? pieceOnScreen(e.clientX, e.clientY, el, performance.now()) : null);
          if (target) actOnTap(target, e.clientX, e.clientY);
          else useStore.getState().select(null);
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
        <PresenceLights />
        <PartPiece />
        <CameraRig />
        {!reducedMotion && <CameraShake />}
        <QualityController />
        <PostLayer />
        {PERF_ENABLED && <PerfHud />}
      </Canvas>
    </div>
  );
}
