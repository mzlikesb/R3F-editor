import { describe, expect, it } from 'vitest';
import type { Fault } from '../../shared/protocol';
import { SENSORS, sensorRange, sensorReading, sensorValue } from '../../shared/sensors';
import {
  PANEL_TICK_MS,
  TREND_POINTS,
  TREND_WINDOW_MS,
  sensorLine,
  trendBaselineY,
  trendOutsidePath,
  trendPoints,
  trendSamples,
} from './sensorView';

const T = 1_800_000_000_000;

describe('constants', () => {
  it('match the plan', () => {
    expect(TREND_WINDOW_MS).toBe(30_000);
    expect(TREND_POINTS).toBe(31);
    expect(PANEL_TICK_MS).toBe(500);
  });
});

describe('trendSamples', () => {
  it('covers the last 30 seconds right away, ending at now', () => {
    const values = trendSamples('oxygen', null, T);
    expect(values).toHaveLength(TREND_POINTS);
    expect(values[0]).toBe(sensorValue('oxygen', null, T - TREND_WINDOW_MS));
    expect(values[15]).toBe(sensorValue('oxygen', null, T - TREND_WINDOW_MS / 2));
    expect(values.at(-1)).toBe(sensorValue('oxygen', null, T));
  });

  it('a fault 10 s ago: healthy line, then the drop', () => {
    const fault: Fault = { id: 'f', moduleId: 'oxygen', createdAt: T - 10_000 };
    const values = trendSamples('oxygen', fault, T);
    for (let i = 0; i <= 20; i++) expect(values[i]).toBe(sensorValue('oxygen', null, T - TREND_WINDOW_MS + i * 1000));
    expect(values.at(-1)).toBe(sensorValue('oxygen', fault, T));
    expect(values.at(-1)).toBeLessThan(values[0]!);
  });
});

describe('trendPoints', () => {
  it('maps the values into the box with a fixed range', () => {
    const { min, max } = sensorRange('oxygen');
    expect(trendPoints('oxygen', [max, min, (min + max) / 2], 100, 20)).toBe('0,0 50,20 100,10');
  });

  it('rounds to one decimal', () => {
    const { min, max } = sensorRange('comms');
    const third = min + (max - min) / 3;
    expect(trendPoints('comms', [third, third, third, third], 10, 10)).toBe('0,6.7 3.3,6.7 6.7,6.7 10,6.7');
  });
});

describe('sensorLine', () => {
  it('is the reading with the healthy level (playtest #47)', () => {
    expect(sensorLine('oxygen', null, T)).toBe(sensorReading('oxygen', sensorValue('oxygen', null, T)));
    expect(sensorLine('generator', null, T)).toMatch(/^출력 \d+kW · 정상 120kW$/);
  });
});

describe('trendBaselineY: the healthy level as a faint line', () => {
  it('sits at nominal in the fixed range', () => {
    for (const id of ['generator', 'greenhouse'] as const) {
      const { min, max } = sensorRange(id);
      const expected = Math.round(((max - SENSORS[id].nominal) / (max - min)) * 24 * 10) / 10;
      expect(trendBaselineY(id, 24)).toBe(expected);
    }
    // Oxygen drops on a fault, so healthy is near the top; the greenhouse heats up, so near the bottom.
    expect(trendBaselineY('oxygen', 24)).toBeLessThan(4);
    expect(trendBaselineY('greenhouse', 24)).toBeGreaterThan(20);
  });
});

describe('trendOutsidePath: the stretch that left the healthy band, in red', () => {
  it('is empty while healthy', () => {
    expect(trendOutsidePath('oxygen', trendSamples('oxygen', null, T), 100, 24)).toBe('');
  });

  it('covers the drop after a fault, starting from the last healthy point', () => {
    const fault: Fault = { id: 'f', moduleId: 'oxygen', createdAt: T - 10_000 };
    const values = trendSamples('oxygen', fault, T);
    const d = trendOutsidePath('oxygen', values, 100, 24);
    expect(d.startsWith('M')).toBe(true);
    // One run, ending at the newest point (x = 100).
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.endsWith(trendPoints('oxygen', values, 100, 24).split(' ').at(-1)!.replace(',', ' '))).toBe(true);
    // It starts a few seconds after the fault (x = 66.7 of 100), not at the beginning.
    const startX = Number(d.slice(1).split(' ')[0]);
    expect(startX).toBeGreaterThanOrEqual(66.7);
    expect(startX).toBeLessThanOrEqual(76.7);
  });

  it('splits into runs when the value comes back in between', () => {
    const { nominal, worst } = SENSORS.comms;
    const d = trendOutsidePath('comms', [nominal, worst, nominal, nominal, worst], 40, 10);
    expect(d.match(/M/g)).toHaveLength(2);
  });
});
