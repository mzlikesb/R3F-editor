import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color } from 'three';
import type { ModuleId } from '../../../shared/protocol';
import { AFTERGLOW_MS } from '../../feedback';
import { relightDelayMs } from '../blackout';
import type { ModuleHandle } from '../moduleTypes';
import { FAULT_COLOR, OK_COLOR, step, SWEEP_S, useOneShot } from './shared';

const tmp = new Color();
const RELIGHT_COLOR = new Color('#ffe2a8');

/**
 * Fault pulse range. The floor is high enough that every frame reads red (playtest of PR #45: at the
 * old floor of 0.1 a screenshot caught the broken generator almost grey).
 */
const PULSE_MIN = 0.8;
const PULSE_MAX = 1.6;
const PULSE_RATE = 4;
/** A broken module's base color is dimmed to this, so the red reads as a warning, not a tint. */
const FAULT_DIM = 0.12;
/** The broken generator pulses this much brighter during a blackout: it is the way out of the dark. */
const BLACKOUT_GENERATOR_BOOST = 1.6;
/** A healthy module's body during a blackout. */
const BLACKOUT_BODY = 0.3;
/** Seconds a module takes to come back to full light once its turn in the relight order arrives. */
const RELIGHT_FADE_S = 0.35;
const RELIGHT_FLASH = 0.7;
/** Someone else's repair leaves the module softly green for `AFTERGLOW_MS` (principle 1). */
const AFTERGLOW_S = AFTERGLOW_MS / 1000;
const AFTERGLOW_PEAK = 0.8;
const AFTERGLOW_COLOR = new Color('#5cf2a0');

function write(handle: ModuleHandle, bases: readonly Color[], color: Color, intensity: number, dim: number): void {
  handle.materials.forEach((m, i) => {
    m.emissive.copy(color);
    m.emissiveIntensity = intensity;
    const base = bases[i];
    if (base) m.color.copy(base).multiplyScalar(dim);
  });
}

/**
 * Drives the module's look: whole-body red pulse (never below `PULSE_MIN`) and a dimmed body while
 * faulted, red→green blend over the sweep on repair, then off. A fault arriving mid-sweep wins.
 * Every frame writes from `faulted` alone, so a re-fault lights up exactly like the first fault.
 *
 * During a blackout healthy bodies go dark (the red pulse of broken ones does not). When it ends
 * (true → false) each module lights up `relightDelayMs(id)` after the others before it; a blackout
 * that was already over at mount plays nothing.
 *
 * `afterglowToken` (someone else's repair): after the sweep, a soft green that fades out over
 * `AFTERGLOW_MS`, on the module's own materials (no extra draw call).
 */
export function useEmissive(
  handle: ModuleHandle | null,
  faulted: boolean,
  sweepToken: number,
  id: ModuleId,
  blackout: boolean,
  afterglowToken: number,
): void {
  const sweepRef = useOneShot(sweepToken);
  const afterglowRef = useOneShot(afterglowToken);
  // The model's own colors (palette map tint), taken once per handle before anything dims them.
  const bases = useMemo(() => handle?.materials.map((m) => m.color.clone()) ?? [], [handle]);

  // Relight clock: -1 idle, otherwise the scene time the blackout ended. `edge` is set by the effect
  // below and turned into a timestamp on the next frame.
  const blackoutRef = useRef(blackout);
  const edge = useRef(false);
  const relightFrom = useRef(-1);
  useEffect(() => {
    if (blackoutRef.current && !blackout) edge.current = true;
    if (blackout) relightFrom.current = -1;
    blackoutRef.current = blackout;
  }, [blackout]);

  useFrame((state, delta) => {
    if (!handle) return;
    if (edge.current) {
      edge.current = false;
      relightFrom.current = state.clock.elapsedTime;
    }

    // 0 = dark, 1 = fully lit.
    let lit = 1;
    if (blackoutRef.current) lit = 0;
    else if (relightFrom.current >= 0) {
      const t = state.clock.elapsedTime - relightFrom.current - relightDelayMs(id) / 1000;
      lit = Math.min(1, Math.max(0, t / RELIGHT_FADE_S));
      if (lit >= 1) relightFrom.current = -1;
    }
    const body = BLACKOUT_BODY + (1 - BLACKOUT_BODY) * lit;

    let color: Color = FAULT_COLOR;
    let intensity = 0;
    let dim = body;
    // Advance every frame so the glow keeps its 3 s from the repair, under the sweep too.
    const glow = step(afterglowRef, delta, AFTERGLOW_S);
    const glowIntensity = glow >= 0 && glow < 1 ? AFTERGLOW_PEAK * Math.sqrt(1 - glow) : 0;
    if (faulted) {
      sweepRef.current = -1;
      afterglowRef.current = -1;
      const wave = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * PULSE_RATE);
      intensity = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * wave;
      if (blackoutRef.current && id === 'generator') intensity *= BLACKOUT_GENERATOR_BOOST;
      dim = FAULT_DIM;
    } else if (sweepRef.current >= 0) {
      const p = step(sweepRef, delta, SWEEP_S);
      if (p >= 0 && p < 1) {
        color = tmp.copy(FAULT_COLOR).lerp(OK_COLOR, Math.min(1, p * 2));
        // The sweep's green hands over to the afterglow without a dip.
        intensity = Math.max(1.1 * (1 - p * p), glowIntensity);
      }
    } else if (glowIntensity > 0) {
      color = AFTERGLOW_COLOR;
      intensity = glowIntensity;
    } else if (lit > 0 && lit < 1) {
      color = RELIGHT_COLOR;
      intensity = RELIGHT_FLASH * Math.sin(Math.PI * lit);
    }
    write(handle, bases, color, intensity, dim);
  });
}
