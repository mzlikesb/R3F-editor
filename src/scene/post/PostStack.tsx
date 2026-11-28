import { useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import {
  BlendFunction,
  RenderPass,
  ToneMappingMode,
  type ChromaticAberrationEffect,
  type EffectComposer as Composer,
} from 'postprocessing';
import { useEffect, useRef, useState } from 'react';
import { Vector2, type Camera, type Scene, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { useStore } from '../../store';
import { chromaOffsetAt } from '../chroma';
import { BLOOM_THRESHOLD, setComposerGain } from '../fx/fxGain';
import { PERF_ENABLED, POST_INFO } from '../perf';
import { usePost } from '../postStore';
import { POST_NO_AO, POST_NO_BLOOM } from '../quality';
import { useReducedMotion } from '../useReducedMotion';

/** The render pass, plus the scene's own draw calls for `?perf` (read before any effect pass draws). */
class CountingRenderPass extends RenderPass {
  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    outputBuffer: WebGLRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean,
  ): void {
    super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
    POST_INFO.scene = renderer.info.render.calls;
    POST_INFO.sceneTriangles = renderer.info.render.triangles;
  }
}
/** Module level: `EffectComposer` rebuilds itself when this function changes. */
const countingRenderPass = (scene: Scene, camera: Camera) => new CountingRenderPass(scene, camera);

/**
 * The colour-offset hit when a blackout starts live (008 C.3). The effect is always in the chain at
 * offset 0 (adding and removing it recompiles); `ref` is the current effect, so a rebuilt composer
 * (Bloom dropped) is picked up again. Off with `prefers-reduced-motion`.
 */
function useChromaPulse() {
  const ref = useRef<ChromaticAberrationEffect>(null);
  const reduced = useReducedMotion();
  useFrame(() => {
    const e = ref.current;
    if (!e) return;
    const a = reduced ? 0 : chromaOffsetAt(performance.now(), useStore.getState().blackoutLiveAt);
    if (e.offset.x !== a) e.offset.set(a, a);
  });
  return ref;
}

/** Once, after the composer's first frame: an incomplete render target sends the session plain (R2). */
function useFramebufferCheck(composer: React.RefObject<Composer | null>) {
  const done = useRef(false);
  useFrame(({ gl }) => {
    const c = composer.current;
    if (done.current || !c) return;
    done.current = true;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(c.inputBuffer);
    const ctx = gl.getContext();
    const complete = ctx.checkFramebufferStatus(ctx.FRAMEBUFFER) === ctx.FRAMEBUFFER_COMPLETE;
    gl.setRenderTarget(prev);
    usePost.getState().dispatch({ type: 'framebuffer', complete });
  }, 2);
}

/** `?perf`: count the whole composed frame by hand (the counters would reset at every pass). */
function useFrameCount() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const info = get().gl.info;
    POST_INFO.on = true;
    if (PERF_ENABLED) info.autoReset = false;
    return () => {
      POST_INFO.on = false;
      info.autoReset = true;
    };
  }, [get]);
  useFrame(({ gl }) => {
    if (!PERF_ENABLED) return;
    POST_INFO.total = gl.info.render.calls;
    gl.info.reset();
  }, 3);
}

/**
 * The post-processing stack on every device (plan 008 B.3): render -> N8AO -> Bloom (only what is
 * past the luminance threshold: glows, sparks, status lights) -> chromatic aberration (0 except the
 * blackout hit) -> vignette -> light noise -> ACES tone mapping -> SMAA (the canvas MSAA is off under
 * a composer). The composer sets the renderer to `NoToneMapping` while mounted, so tone mapping
 * happens once, here. `post` is the quality ladder's post axis: N8AO is only disabled (no rebuild),
 * Bloom is taken out (the composer rebuilds its passes once). The stencil buffer keeps the selection
 * outline to the silhouette (`fx/hull.ts`).
 */
export function PostStack({ post }: { post: number }) {
  const composer = useRef<Composer>(null);
  // Owned by this stack: the effect may keep it as its uniform value and `useChromaPulse` writes it.
  const [offset] = useState(() => new Vector2(0, 0));
  const chroma = useChromaPulse();
  useFramebufferCheck(composer);
  useFrameCount();
  useEffect(() => {
    setComposerGain(true);
    return () => setComposerGain(false);
  }, []);

  return (
    <EffectComposer
      ref={composer}
      multisampling={0}
      enableNormalPass={false}
      stencilBuffer
      renderPass={countingRenderPass}
    >
      <N8AO enabled={post < POST_NO_AO} aoRadius={1.6} intensity={2.2} distanceFalloff={1} quality="medium" halfRes />
      {post < POST_NO_BLOOM ? (
        <Bloom intensity={0.9} luminanceThreshold={BLOOM_THRESHOLD} luminanceSmoothing={0.25} mipmapBlur />
      ) : (
        <></>
      )}
      <ChromaticAberration ref={chroma} offset={offset} radialModulation={false} modulationOffset={0} />
      <Vignette offset={0.3} darkness={0.55} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.08} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}
