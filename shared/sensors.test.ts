import { describe, expect, it } from 'vitest';
import { MODULE_IDS, type Fault, type ModuleId } from './protocol';
import { SENSORS, formatSensor, sensorRange, sensorValue, severity } from './sensors';

const T0 = 1_800_000_000_000;
const faultOn = (moduleId: ModuleId, createdAt = T0): Fault => ({ id: `f-${moduleId}`, moduleId, createdAt });

describe('sensorValue', () => {
  it('is deterministic: same inputs, same value', () => {
    for (const id of MODULE_IDS) {
      expect(sensorValue(id, null, T0 + 1234)).toBe(sensorValue(id, null, T0 + 1234));
      expect(sensorValue(id, faultOn(id), T0 + 5678)).toBe(sensorValue(id, faultOn(id), T0 + 5678));
    }
  });

  it('wobbles near nominal while healthy, and actually moves', () => {
    for (const id of MODULE_IDS) {
      const spec = SENSORS[id];
      const values = Array.from({ length: 120 }, (_, i) => sensorValue(id, null, T0 + i * 250));
      for (const v of values) expect(Math.abs(v - spec.nominal)).toBeLessThanOrEqual(spec.wobble + 1e-9);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(spec.wobble * 0.5);
    }
  });

  it('gets worse the longer a fault lasts, then stays at the cap', () => {
    for (const id of MODULE_IDS) {
      const spec = SENSORS[id];
      const f = faultOn(id);
      const off = (t: number) => Math.abs(sensorValue(id, f, t) - spec.nominal);
      // Beyond the wobble, the distance from nominal grows with time.
      expect(off(T0 + spec.rampMs / 2)).toBeGreaterThan(off(T0) + spec.wobble);
      expect(off(T0 + spec.rampMs)).toBeGreaterThan(off(T0 + spec.rampMs / 4));
      // Capped: an hour later it is still within wobble of `worst`.
      for (const later of [spec.rampMs, spec.rampMs * 3, 3_600_000]) {
        expect(Math.abs(sensorValue(id, f, T0 + later) - spec.worst)).toBeLessThanOrEqual(spec.wobble + 1e-9);
      }
    }
  });

  it('stays within the graph range in every state', () => {
    for (const id of MODULE_IDS) {
      const { min, max } = sensorRange(id);
      for (let t = -60_000; t < 600_000; t += 997) {
        for (const f of [null, faultOn(id)]) {
          const v = sensorValue(id, f, T0 + t);
          expect(v).toBeGreaterThanOrEqual(min - 1e-9);
          expect(v).toBeLessThanOrEqual(max + 1e-9);
        }
      }
    }
  });

  it('reads as healthy before the fault was created (30-second trend right after a fault)', () => {
    for (const id of MODULE_IDS) {
      const f = faultOn(id, T0 + 10_000);
      expect(sensorValue(id, f, T0)).toBe(sensorValue(id, null, T0));
      expect(sensorValue(id, f, T0 + 10_000)).toBe(sensorValue(id, null, T0 + 10_000));
    }
  });

  it('ignores a fault on another module', () => {
    expect(sensorValue('oxygen', faultOn('generator'), T0 + 30_000)).toBe(sensorValue('oxygen', null, T0 + 30_000));
  });

  it('a fault made while nobody was here (createdAt in the past) is already worse on arrival', () => {
    const spec = SENSORS.oxygen;
    const longAgo = faultOn('oxygen', T0 - 10 * 60_000);
    expect(Math.abs(sensorValue('oxygen', longAgo, T0) - spec.worst)).toBeLessThanOrEqual(spec.wobble + 1e-9);
  });
});

describe('severity', () => {
  it('eases from 0 to 1 over the ramp and caps', () => {
    expect(severity(-5, 1000)).toBe(0);
    expect(severity(0, 1000)).toBe(0);
    expect(severity(500, 1000)).toBeCloseTo(0.75);
    expect(severity(1000, 1000)).toBe(1);
    expect(severity(5000, 1000)).toBe(1);
    expect(severity(Number.NaN, 1000)).toBe(0);
  });
});

describe('formatSensor', () => {
  it('rounds to the spec digits and appends the unit', () => {
    expect(formatSensor('oxygen', 91.6)).toBe('92%');
    expect(formatSensor('greenhouse', 41.23)).toBe('41.2℃');
    expect(formatSensor('generator', 118.4)).toBe('118kW');
    expect(formatSensor('habitat', 100.96)).toBe('101.0kPa');
    expect(formatSensor('comms', -0.2)).toBe('0%');
  });
});
