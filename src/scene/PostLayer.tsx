import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { SceneErrorBoundary } from './ErrorBoundary';
import { hasPostSupport, rendererToneMapping } from './postMode';
import { usePost } from './postStore';
import { POST_OFF } from './quality';
import { useQuality } from './qualityStore';

type PostModule = typeof import('./post/PostStack');

/**
 * The post-processing chunk, requested when the app starts (with the models and the snapshot, plan
 * 008 B.5). A rejected import sends the session plain here, not through an error boundary (R2).
 */
const chunk: Promise<PostModule | null> = import('./post/PostStack').then(
  (m) => {
    usePost.getState().dispatch({ type: 'chunk', ok: true });
    return m;
  },
  () => {
    usePost.getState().dispatch({ type: 'chunk', ok: false });
    return null;
  },
);

const crashed = () => usePost.getState().dispatch({ type: 'crash' });

/**
 * Mounts the composer when the session has one (`postMode`) and the quality ladder has not taken it
 * away. Checks the device first (WebGL2, half-float targets). Without the composer the renderer tone
 * maps (`rendererToneMapping`); a throw while it mounts lands in its own error boundary and the
 * session goes plain. The scene itself never imports the post-processing libraries.
 */
export function PostLayer() {
  const get = useThree((s) => s.get);
  const mode = usePost((s) => s.state.mode);
  const post = useQuality((s) => s.post);
  const [mod, setMod] = useState<PostModule | null>(null);

  useEffect(() => {
    const { gl } = get();
    const ok = hasPostSupport({ isWebGL2: gl.capabilities.isWebGL2, has: (n) => gl.extensions.has(n) });
    usePost.getState().dispatch({ type: 'support', ok });
  }, [get]);

  useEffect(() => {
    let live = true;
    void chunk.then((m) => {
      if (live && m) setMod(m);
    });
    return () => {
      live = false;
    };
  }, []);

  const on = mode === 'composer' && post < POST_OFF && mod !== null;
  useEffect(() => {
    get().gl.toneMapping = rendererToneMapping(on ? 'composer' : 'plain');
  }, [get, on]);

  if (!on) return null;
  return (
    <SceneErrorBoundary fallback={null} onError={crashed}>
      <mod.PostStack post={post} />
    </SceneErrorBoundary>
  );
}
