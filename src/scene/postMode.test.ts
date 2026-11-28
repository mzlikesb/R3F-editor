import { ACESFilmicToneMapping, NoToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import {
  POST_WAIT_MS,
  hasPostSupport,
  initialPost,
  postSettled,
  reducePost,
  rendererToneMapping,
  type PostEvent,
  type PostState,
} from './postMode';

/** Feeds events in order from the initial state. */
const run = (...events: PostEvent[]): PostState => events.reduce(reducePost, initialPost);

/** The four failure paths of 008 R2, each must end on plain with the renderer's tone mapping on. */
function expectPlain(s: PostState) {
  expect(s.mode).toBe('plain');
  expect(rendererToneMapping(s.mode)).toBe(ACESFilmicToneMapping);
  expect(postSettled(s.mode)).toBe(true);
}

describe('postMode (008 B.5, R2)', () => {
  it('starts pending: the loading banner waits', () => {
    expect(initialPost.mode).toBe('pending');
    expect(postSettled(initialPost.mode)).toBe(false);
  });

  it('support and the chunk, in either order, give the composer and the renderer stops tone mapping', () => {
    for (const s of [
      run({ type: 'support', ok: true }, { type: 'chunk', ok: true }),
      run({ type: 'chunk', ok: true }, { type: 'support', ok: true }),
    ]) {
      expect(s.mode).toBe('composer');
      expect(rendererToneMapping(s.mode)).toBe(NoToneMapping);
      expect(postSettled(s.mode)).toBe(true);
    }
  });

  it('one of the two alone stays pending', () => {
    expect(run({ type: 'support', ok: true }).mode).toBe('pending');
    expect(run({ type: 'chunk', ok: true }).mode).toBe('pending');
  });

  it('no WebGL2 or half-float target (support false): plain, even if the chunk arrives', () => {
    expectPlain(run({ type: 'support', ok: false }));
    expectPlain(run({ type: 'support', ok: false }, { type: 'chunk', ok: true }));
    expectPlain(run({ type: 'chunk', ok: true }, { type: 'support', ok: false }));
  });

  it('the dynamic import rejected: plain', () => {
    expectPlain(run({ type: 'chunk', ok: false }));
    expectPlain(run({ type: 'support', ok: true }, { type: 'chunk', ok: false }));
  });

  it('the 2 s wait after the scene is ready ran out: plain, and a chunk arriving later is not used', () => {
    expect(POST_WAIT_MS).toBe(2000);
    expectPlain(run({ type: 'support', ok: true }, { type: 'timeout' }));
    expectPlain(run({ type: 'support', ok: true }, { type: 'timeout' }, { type: 'chunk', ok: true }));
  });

  it('a timeout after the composer was chosen changes nothing', () => {
    const s = run({ type: 'support', ok: true }, { type: 'chunk', ok: true }, { type: 'timeout' });
    expect(s.mode).toBe('composer');
  });

  it('an incomplete framebuffer after the first composer frame: plain', () => {
    expectPlain(
      run({ type: 'support', ok: true }, { type: 'chunk', ok: true }, { type: 'framebuffer', complete: false }),
    );
    const ok = run({ type: 'support', ok: true }, { type: 'chunk', ok: true }, { type: 'framebuffer', complete: true });
    expect(ok.mode).toBe('composer');
  });

  it('the post-processing error boundary caught a throw: plain', () => {
    expectPlain(run({ type: 'support', ok: true }, { type: 'chunk', ok: true }, { type: 'crash' }));
  });

  it('plain is for the whole session: nothing brings the composer back', () => {
    const s = run(
      { type: 'chunk', ok: false },
      { type: 'support', ok: true },
      { type: 'chunk', ok: true },
      { type: 'framebuffer', complete: true },
    );
    expectPlain(s);
  });

  it('pending keeps the renderer tone mapping (nothing is composed yet)', () => {
    expect(rendererToneMapping('pending')).toBe(ACESFilmicToneMapping);
  });
});

describe('hasPostSupport (008 R2 pre-check)', () => {
  const caps = (isWebGL2: boolean, exts: string[]) => ({ isWebGL2, has: (name: string) => exts.includes(name) });

  it('needs WebGL2', () => {
    expect(hasPostSupport(caps(false, ['EXT_color_buffer_float', 'EXT_color_buffer_half_float']))).toBe(false);
  });

  it('needs a half-float or float colour buffer', () => {
    expect(hasPostSupport(caps(true, []))).toBe(false);
    expect(hasPostSupport(caps(true, ['EXT_color_buffer_half_float']))).toBe(true);
    expect(hasPostSupport(caps(true, ['EXT_color_buffer_float']))).toBe(true);
  });
});
