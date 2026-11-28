import { create } from 'zustand';
import { POST_FULL, POST_OFF } from './quality';
import { POST_WAIT_MS, initialPost, reducePost, type PostEvent, type PostState } from './postMode';
import { useQuality } from './qualityStore';

interface PostStore {
  state: PostState;
  /** The scene finished loading (the banner's own `done`); the `POST_WAIT_MS` clock runs from here. */
  sceneReady: boolean;
  dispatch: (e: PostEvent) => void;
  markSceneReady: () => void;
}

/**
 * The session's post-processing mode (plan 008 B.5, R2) around the pure `reducePost`. Choosing the
 * composer opens the quality ladder's post axis (`POST_FULL`); going plain spends it (`POST_OFF`).
 */
export const usePost = create<PostStore>((set, get) => ({
  state: initialPost,
  sceneReady: false,
  dispatch: (e) => {
    const prev = get().state;
    const state = reducePost(prev, e);
    if (state === prev) return;
    set({ state });
    if (state.mode !== prev.mode) {
      if (state.mode === 'composer') useQuality.getState().setPost(POST_FULL);
      if (state.mode === 'plain') useQuality.getState().setPost(POST_OFF);
    }
  },
  markSceneReady: () => {
    if (get().sceneReady) return;
    set({ sceneReady: true });
    setTimeout(() => get().dispatch({ type: 'timeout' }), POST_WAIT_MS);
  },
}));
