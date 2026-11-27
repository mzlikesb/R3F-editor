/**
 * One sensor per module (plan 006 A.8). Values are never stored or sent: every client derives them
 * from the fault state and the (offset-corrected) server clock with the same pure function, so every
 * screen shows the same number. Owned by the dev lead.
 */
import type { Fault, ModuleId } from './protocol';

export interface SensorSpec {
  /** Long name: `발전기 출력`. */
  label: string;
  /** Short name next to the value in the panel and the badge: `출력`. */
  short: string;
  /** Appended to the value: `kW`, `%`, `℃`, `kPa`. */
  unit: string;
  /** Healthy level. */
  nominal: number;
  /** Peak size of the healthy wobble (sum of two sines). */
  wobble: number;
  /** Where a fault drives the value to, and stays (the cap). */
  worst: number;
  /** A fault reaches `worst` after this long (ease-out). */
  rampMs: number;
  /** Decimals when shown. */
  digits: number;
}

export const SENSORS: Record<ModuleId, SensorSpec> = {
  generator: {
    label: '발전기 출력',
    short: '출력',
    unit: 'kW',
    nominal: 120,
    wobble: 3,
    worst: 35,
    rampMs: 60_000,
    digits: 0,
  },
  oxygen: { label: '산소', short: '산소', unit: '%', nominal: 98, wobble: 0.8, worst: 61, rampMs: 90_000, digits: 0 },
  greenhouse: {
    label: '온실 온도',
    short: '온도',
    unit: '℃',
    nominal: 22,
    wobble: 0.6,
    worst: 41,
    rampMs: 90_000,
    digits: 1,
  },
  comms: {
    label: '통신 신호',
    short: '신호',
    unit: '%',
    nominal: 94,
    wobble: 2.5,
    worst: 12,
    rampMs: 45_000,
    digits: 0,
  },
  habitat: {
    label: '거주 돔 기압',
    short: '기압',
    unit: 'kPa',
    nominal: 101,
    wobble: 0.4,
    worst: 78,
    rampMs: 120_000,
    digits: 1,
  },
};

/** Wobble periods (ms). Not multiples of each other, so the line never looks like a clean loop. */
const SLOW_MS = 7_300;
const FAST_MS = 2_300;
const PHASE: Record<ModuleId, number> = { generator: 0, oxygen: 1.3, greenhouse: 2.6, comms: 3.9, habitat: 5.2 };

/** 0..1, how far a fault has pushed the sensor toward `worst` after `elapsedMs`. Ease-out, capped at 1. */
export function severity(elapsedMs: number, rampMs: number): number {
  if (!(elapsedMs > 0)) return 0;
  const x = Math.min(1, elapsedMs / rampMs);
  return 1 - (1 - x) * (1 - x);
}

/**
 * The sensor value of `moduleId` at server time `now` (epoch ms). Deterministic.
 * - Healthy (`fault` null, or `now` before `fault.createdAt`): `nominal` plus a wobble within ±`wobble`.
 * - Faulted: moves from `nominal` to `worst` over `rampMs` and stays there (still wobbling).
 * So every value is within [min(nominal, worst) - wobble, max(nominal, worst) + wobble].
 * A `fault` for another module is treated as no fault.
 */
export function sensorValue(moduleId: ModuleId, fault: Fault | null, now: number): number {
  const spec = SENSORS[moduleId];
  const phase = PHASE[moduleId];
  const w =
    0.65 * Math.sin((2 * Math.PI * now) / SLOW_MS + phase) + 0.35 * Math.sin((2 * Math.PI * now) / FAST_MS + phase * 2);
  const elapsed = fault && fault.moduleId === moduleId ? now - fault.createdAt : 0;
  const s = severity(elapsed, spec.rampMs);
  return spec.nominal + (spec.worst - spec.nominal) * s + spec.wobble * w;
}

/** `92%`, `41.2℃`, `118kW`: the value rounded to the spec's digits, then the unit. */
export function formatSensor(moduleId: ModuleId, value: number): string {
  const spec = SENSORS[moduleId];
  const fixed = value.toFixed(spec.digits);
  // `-0` would read oddly; no sensor goes below zero anyway.
  return `${fixed === '-0' ? '0' : fixed}${spec.unit}`;
}

/** The fixed y-range for this sensor's trend graph, so the line does not rescale as it moves. */
export function sensorRange(moduleId: ModuleId): { min: number; max: number } {
  const spec = SENSORS[moduleId];
  return {
    min: Math.min(spec.nominal, spec.worst) - spec.wobble,
    max: Math.max(spec.nominal, spec.worst) + spec.wobble,
  };
}

/** `출력 96kW · 기준 120kW`: the value with the healthy level, so the number means something. */
export function sensorReading(moduleId: ModuleId, value: number): string {
  const spec = SENSORS[moduleId];
  return `${spec.short} ${formatSensor(moduleId, value)} · 기준 ${formatSensor(moduleId, spec.nominal)}`;
}

/** A little past the healthy wobble, so rounding never flags a healthy value. */
const ABNORMAL_MARGIN = 1.05;

/**
 * True when `value` has left the healthy band toward the fault side (down for most sensors, up for
 * the greenhouse temperature). The healthy wobble never counts.
 */
export function isAbnormal(moduleId: ModuleId, value: number): boolean {
  const spec = SENSORS[moduleId];
  const toward = Math.sign(spec.worst - spec.nominal);
  return (value - spec.nominal) * toward > spec.wobble * ABNORMAL_MARGIN;
}
