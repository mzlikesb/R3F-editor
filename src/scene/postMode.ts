import { ACESFilmicToneMapping, NoToneMapping, type ToneMapping } from 'three';

/**
 * Whether this session draws through the post-processing composer (plan 008 B.5, R2). Pure.
 * `pending` until both the device check and the chunk are in; `composer` then; `plain` on any
 * failure, and for the rest of the session (a chunk that arrives late is not used).
 */
export type PostMode = 'pending' | 'composer' | 'plain';

export type PostEvent =
  /** WebGL2 and a half-float or float colour buffer (`hasPostSupport`). */
  | { type: 'support'; ok: boolean }
  /** The dynamic `import()` of `src/scene/post/` resolved or was rejected. */
  | { type: 'chunk'; ok: boolean }
  /** `POST_WAIT_MS` passed since the scene was ready. */
  | { type: 'timeout' }
  /** Checked once after the composer's first frame. */
  | { type: 'framebuffer'; complete: boolean }
  /** The post-processing error boundary caught a throw. */
  | { type: 'crash' };

export interface PostState {
  mode: PostMode;
  supported: boolean;
  chunk: boolean;
}

export const initialPost: PostState = { mode: 'pending', supported: false, chunk: false };

/** How long the loading banner waits for post-processing once the scene itself is ready. */
export const POST_WAIT_MS = 2000;

const PLAIN = (s: PostState): PostState => (s.mode === 'plain' ? s : { ...s, mode: 'plain' });

export function reducePost(s: PostState, e: PostEvent): PostState {
  if (s.mode === 'plain') return s;
  switch (e.type) {
    case 'support':
    case 'chunk': {
      if (!e.ok) return PLAIN(s);
      const next = { ...s, [e.type === 'support' ? 'supported' : 'chunk']: true };
      return s.mode === 'pending' && next.supported && next.chunk ? { ...next, mode: 'composer' } : next;
    }
    case 'timeout':
      return s.mode === 'pending' ? PLAIN(s) : s;
    case 'framebuffer':
      return e.complete ? s : PLAIN(s);
    case 'crash':
      return PLAIN(s);
  }
}

/** The loading banner may go once this is true (with the scene ready). */
export function postSettled(mode: PostMode): boolean {
  return mode !== 'pending';
}

/** The composer's `ToneMapping` effect tone maps once at the end; everywhere else the renderer does. */
export function rendererToneMapping(mode: PostMode): ToneMapping {
  return mode === 'composer' ? NoToneMapping : ACESFilmicToneMapping;
}

/** The slice of `WebGLRenderer` (`capabilities.isWebGL2`, `extensions.has`) the check needs. */
export interface GlCaps {
  isWebGL2: boolean;
  has: (extension: string) => boolean;
}

/** The composer renders into half-float targets: WebGL2 and a colour buffer extension for them. */
export function hasPostSupport({ isWebGL2, has }: GlCaps): boolean {
  return isWebGL2 && (has('EXT_color_buffer_half_float') || has('EXT_color_buffer_float'));
}
