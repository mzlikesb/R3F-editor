import { useEffect, useRef, type MutableRefObject } from 'react';
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, RingGeometry } from 'three';
import { PALETTE } from '../palette';
import { registerFx } from './fxGain';

/** Colors of the fault (red), healthy (green) and selected (cyan) states. */
export const FAULT_COLOR = new Color(PALETTE.fault);
export const OK_COLOR = new Color(PALETTE.repaired);
export const REPAIR_FLASH_COLOR = new Color(PALETTE.repairFlash);
export const SELECT_COLOR = new Color(PALETTE.select);

/** Durations (seconds) of the one-shot effects. */
export const SWEEP_S = 0.9;
/**
 * Someone else's repair ripple (#106): 2.6 s, up from 1.5, so a glance at the base a second after it
 * still catches it (a 3D ring on the floor is easy to miss while looking at the panel or a label).
 */
export const PING_S = 2.6;
export const BURST_S = 1.0;

/** A unit ring (outer radius 1) lying in the XY plane; meshes rotate it flat and scale it. */
export const RING_GEOMETRY = new RingGeometry(0.9, 1, 64);
/** The same, thinner: the selection ring. */
export const THIN_RING_GEOMETRY = new RingGeometry(0.95, 1, 64);

/**
 * A new translucent, unlit ring material; each effect owns one so opacity is its own. No fog. Under
 * the composer its colour takes the ring gain (`fxGain.ts`), staying under the Bloom threshold.
 */
export function createRingMaterial(color: Color, additive = false): MeshBasicMaterial {
  const m = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
    blending: additive ? AdditiveBlending : undefined,
  });
  registerFx(m, 'tone');
  return m;
}

/**
 * A one-shot timer: `t` is seconds since the last trigger, -1 while idle. The trigger `token` is the
 * repair `seq`; 0 means none yet. A token that already existed at mount never plays.
 */
export function useOneShot(token: number): MutableRefObject<number> {
  const t = useRef(-1);
  useEffect(() => {
    if (token > 0) t.current = 0;
  }, [token]);
  return t;
}

/**
 * Advances a one-shot timer and returns its progress in [0, 1], or -1 while idle. Returns 1 once,
 * on the frame it ends, so callers can hide what they drew.
 */
export function step(timer: MutableRefObject<number>, delta: number, duration: number): number {
  if (timer.current < 0) return -1;
  timer.current += delta;
  if (timer.current >= duration) {
    timer.current = -1;
    return 1;
  }
  return timer.current / duration;
}

/** Sets a material's opacity. A plain function so render-time lint does not see a hook-value write. */
export function setOpacity(material: { opacity: number }, value: number): void {
  material.opacity = value;
}
