import { useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  N8AO,
  Noise,
  Outline,
  Selection,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CanvasTexture, SRGBColorSpace, Vector2 } from 'three';
import { selectBlackout, useStore } from '../../store';
import { LOOK_INFO, SELECT_COLOR } from '../look';

/** `?look=max`: the sky as a scene background (the composer does not keep a transparent canvas). */
function SkyBackground() {
  const get = useThree((s) => s.get);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#070b18');
    grad.addColorStop(0.48, '#14233f');
    grad.addColorStop(1, '#2b3f5e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => {
    const scene = get().scene;
    scene.background = tex;
    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [get, tex]);
  useFrame(({ scene }, delta) => {
    const target = selectBlackout(useStore.getState()) ? 0.15 : 1;
    scene.backgroundIntensity += (target - scene.backgroundIntensity) * Math.min(1, delta * 3);
  });
  return null;
}

const PULSE_S = 0.4;
const AMOUNT = 0.012;

/** Chromatic aberration kicks in for 0.4 s when the lights go out. */
function useBlackoutPulse() {
  const offset = useMemo(() => new Vector2(0, 0), []);
  const t = useRef(-1);
  const was = useRef(false);
  useFrame((_, delta) => {
    const dark = selectBlackout(useStore.getState());
    if (dark && !was.current) t.current = 0;
    was.current = dark;
    if (t.current >= 0) {
      t.current += delta;
      const p = t.current / PULSE_S;
      const k = p >= 1 ? 0 : Math.sin(p * Math.PI);
      offset.set(AMOUNT * k, AMOUNT * k);
      if (p >= 1) t.current = -1;
    }
  });
  return offset;
}

/** Counts the whole frame (all composer passes) for `?perf`: reset by hand after the last pass. */
function useFrameInfo() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const info = get().gl.info;
    info.autoReset = false;
    return () => {
      info.autoReset = true;
    };
  }, [get]);
  useFrame(({ gl }) => {
    LOOK_INFO.calls = gl.info.render.calls;
    LOOK_INFO.triangles = gl.info.render.triangles;
    gl.info.reset();
  }, 2);
}

function Stack() {
  const offset = useBlackoutPulse();
  useFrameInfo();
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={1.6} intensity={2.2} distanceFalloff={1} quality="medium" halfRes />
      <Outline
        visibleEdgeColor={SELECT_COLOR.getHex()}
        hiddenEdgeColor={SELECT_COLOR.getHex()}
        edgeStrength={10}
        blur
      />
      <Bloom intensity={0.9} luminanceThreshold={1.2} luminanceSmoothing={0.25} mipmapBlur />
      <ChromaticAberration offset={offset} radialModulation={false} modulationOffset={0} />
      <Vignette offset={0.3} darkness={0.55} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.08} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

/** Selection context for `Select`/`Outline` around the whole scene, plus the composer and sky. */
export function PostRoot({ children }: { children: ReactNode }) {
  return (
    <Selection>
      <SkyBackground />
      {children}
      <Stack />
    </Selection>
  );
}
