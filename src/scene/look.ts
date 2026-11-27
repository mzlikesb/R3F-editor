import { Color } from 'three';
import { parseLook, type Look } from './lookParse';

/**
 * `?look=`. No query keeps the scene exactly as it is; `budget` adds cheap effects (fog, quieter
 * panels, selection ring + hull outline); `max` adds a full post-processing stack on every device.
 */
export const LOOK: Look = parseLook(window.location.search);

/** Selection accent (cyan: red is a fault, green a repair). */
export const SELECT_COLOR = new Color('#38d6ff');

/** Whole-frame draw calls and triangles, written by the composer in `?look=max` for `PerfHud`. */
export const LOOK_INFO = { calls: 0, triangles: 0 };
