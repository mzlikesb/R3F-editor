import type { ModuleFxProps } from '../moduleTypes';

/**
 * Everything that shows a module's state, rendered by `scene/Module.tsx` inside the module's
 * positioned group (local origin = module ground center): emissive pulse and red→green blend,
 * status light, name tag / fault badge, floor ring, sweep ring, punch, sparks, glow, ring ping.
 * Track `feel` (plan 005 B, C, D.11). Stub until then.
 */
export function ModuleFx({ id, handle }: ModuleFxProps) {
  void id;
  void handle;
  return null;
}
