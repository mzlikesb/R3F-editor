import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_WAIT_MS, initialPost } from './postMode';
import { usePost } from './postStore';
import { POST_FULL, POST_OFF } from './quality';
import { resetQualityStoreForTest, useQuality } from './qualityStore';

beforeEach(() => {
  resetQualityStoreForTest();
  usePost.setState({ state: initialPost, sceneReady: false });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  resetQualityStoreForTest();
});

describe('usePost (008 B.5, R2, R3)', () => {
  it('choosing the composer opens the post axis of the quality ladder', () => {
    expect(useQuality.getState().post).toBe(POST_OFF);
    usePost.getState().dispatch({ type: 'support', ok: true });
    usePost.getState().dispatch({ type: 'chunk', ok: true });
    expect(usePost.getState().state.mode).toBe('composer');
    expect(useQuality.getState().post).toBe(POST_FULL);
  });

  it('going plain later spends it', () => {
    usePost.getState().dispatch({ type: 'support', ok: true });
    usePost.getState().dispatch({ type: 'chunk', ok: true });
    usePost.getState().dispatch({ type: 'framebuffer', complete: false });
    expect(useQuality.getState().post).toBe(POST_OFF);
  });

  it('the scene ready and no chunk for POST_WAIT_MS: plain', () => {
    usePost.getState().dispatch({ type: 'support', ok: true });
    usePost.getState().markSceneReady();
    vi.advanceTimersByTime(POST_WAIT_MS - 1);
    expect(usePost.getState().state.mode).toBe('pending');
    vi.advanceTimersByTime(1);
    expect(usePost.getState().state.mode).toBe('plain');
    usePost.getState().dispatch({ type: 'chunk', ok: true });
    expect(usePost.getState().state.mode).toBe('plain');
  });

  it('the scene being ready twice starts one clock', () => {
    usePost.getState().markSceneReady();
    usePost.getState().markSceneReady();
    expect(vi.getTimerCount()).toBe(1);
  });
});
