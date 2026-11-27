/**
 * Sensor numbers and the 30-second trend line in the panel (plan 006 C.16). Pure; values come from
 * `shared/sensors.ts` at server time, so the trend is drawn in full right after connecting (no
 * samples are collected). Track `client` implements the TODO bodies.
 */
import type { Fault, ModuleId } from '../../shared/protocol';
import { SENSORS, isAbnormal, sensorRange, sensorReading, sensorValue } from '../../shared/sensors';

/** The trend shows this much history. */
export const TREND_WINDOW_MS = 30_000;
/** Points on the trend line (one per second, both ends included). */
export const TREND_POINTS = 31;
/** The open panel re-reads the sensor this often. */
export const PANEL_TICK_MS = 500;

/**
 * `TREND_POINTS` values of `sensorValue(moduleId, fault, t)`, evenly spaced from
 * `serverNow - TREND_WINDOW_MS` to `serverNow` (last one exactly at `serverNow`).
 */
export function trendSamples(moduleId: ModuleId, fault: Fault | null, serverNow: number): number[] {
  const step = TREND_WINDOW_MS / (TREND_POINTS - 1);
  return Array.from({ length: TREND_POINTS }, (_, i) =>
    sensorValue(moduleId, fault, i === TREND_POINTS - 1 ? serverNow : serverNow - TREND_WINDOW_MS + i * step),
  );
}

/**
 * SVG `<polyline points>` for `values` in a `width` × `height` box: x evenly from 0 to `width`,
 * y from `sensorRange(moduleId)` (max at 0, min at `height`), each number rounded to one decimal,
 * pairs as `x,y` joined by single spaces.
 */
export function trendPoints(moduleId: ModuleId, values: readonly number[], width: number, height: number): string {
  const { min, max } = sensorRange(moduleId);
  const round = (n: number) => Math.round(n * 10) / 10;
  const last = Math.max(1, values.length - 1);
  return values.map((v, i) => `${round((i / last) * width)},${round(((max - v) / (max - min)) * height)}`).join(' ');
}

/** Panel line: `산소 92% · 기준 98%` (`sensorReading`). */
export function sensorLine(moduleId: ModuleId, fault: Fault | null, serverNow: number): string {
  return sensorReading(moduleId, sensorValue(moduleId, fault, serverNow));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** y of the healthy level (`nominal`) in a trend box `height` tall, same range as `trendPoints`. */
export function trendBaselineY(moduleId: ModuleId, height: number): number {
  const { min, max } = sensorRange(moduleId);
  return round1(((max - SENSORS[moduleId].nominal) / (max - min)) * height);
}

/**
 * SVG path `d` over the stretches of `values` that are `isAbnormal`, drawn in red on top of the
 * trend. Each run starts at the point before it (the last healthy one), so it joins the line:
 * `M x y L x y …`, one `M` per run. Empty when everything is healthy.
 */
export function trendOutsidePath(moduleId: ModuleId, values: readonly number[], width: number, height: number): string {
  const { min, max } = sensorRange(moduleId);
  const last = Math.max(1, values.length - 1);
  const pt = (i: number) => `${round1((i / last) * width)} ${round1(((max - values[i]!) / (max - min)) * height)}`;
  const parts: string[] = [];
  let inRun = false;
  values.forEach((v, i) => {
    if (!isAbnormal(moduleId, v)) {
      inRun = false;
      return;
    }
    if (!inRun) parts.push(`M${pt(Math.max(0, i - 1))}`);
    if (!inRun && i === 0) {
      inRun = true;
      return;
    }
    inRun = true;
    parts.push(`L${pt(i)}`);
  });
  return parts.join(' ');
}
