/**
 * The seam between track `scene` (loads and places a module) and track `feel` (shows its state).
 * Owned by the dev lead; changing it needs both tracks. See `docs/plans/005-tasks.md`.
 */
import type { Group, MeshStandardMaterial } from 'three';
import type { BaseModuleId } from '../modules';

/**
 * What `scene/Module.tsx` hands to `scene/fx/ModuleFx.tsx` once the module's model (GLB or the
 * fallback shape) is mounted. A new handle object is passed whenever the model is swapped
 * (e.g. GLB failed → fallback).
 */
export interface ModuleHandle {
  /**
   * The model's own group, pivot at the module's ground center. `feel` animates its `scale` (punch)
   * and nothing else; `scene` never writes `scale` on it after mount.
   */
  model: Group;
  /**
   * This module's own `MeshStandardMaterial` clones (never shared with another module). `feel`
   * owns `emissive` and `emissiveIntensity` on them; `scene` sets them once to black / 0 and does
   * not touch them again.
   */
  materials: readonly MeshStandardMaterial[];
  /** Model height in the module group's local units (top of the bounding box), for badges, name tags and the sweep ring. */
  height: number;
  /** Horizontal radius in the module group's local units (bounding box), for the floor ring and the ring ping. */
  radius: number;
}

export interface ModuleFxProps {
  id: BaseModuleId;
  /** null until the model is mounted. */
  handle: ModuleHandle | null;
}
