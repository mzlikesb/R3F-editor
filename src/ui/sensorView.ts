/**
 * Sensor numbers and the 30-second trend line in the panel (plan 006 C.16). Pure; values come from
 * `shared/sensors.ts` at server time, so the trend is drawn in full right after connecting (no
 * samples are collected). Track `client` implements the TODO bodies.
 */
import type { Fault, ModuleId } from '../../shared/protocol';

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
  void moduleId;
  void fault;
  void serverNow;
  throw new Error('TODO(client): trendSamples');
}

/**
 * SVG `<polyline points>` for `values` in a `width` × `height` box: x evenly from 0 to `width`,
 * y from `sensorRange(moduleId)` (max at 0, min at `height`), each number rounded to one decimal,
 * pairs as `x,y` joined by single spaces.
 */
export function trendPoints(moduleId: ModuleId, values: readonly number[], width: number, height: number): string {
  void moduleId;
  void values;
  void width;
  void height;
  throw new Error('TODO(client): trendPoints');
}

/** Panel line: `산소 92%` (`SENSORS[id].label` + `formatSensor`). */
export function sensorLine(moduleId: ModuleId, fault: Fault | null, serverNow: number): string {
  void moduleId;
  void fault;
  void serverNow;
  throw new Error('TODO(client): sensorLine');
}
