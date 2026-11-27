import { describe, expect, it } from 'vitest';
import type { Fault } from '../../shared/protocol';
import { formatSensor, sensorRange, sensorValue } from '../../shared/sensors';
import { PANEL_TICK_MS, TREND_POINTS, TREND_WINDOW_MS, sensorLine, trendPoints, trendSamples } from './sensorView';

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
  it('is the label and the formatted value', () => {
    expect(sensorLine('oxygen', null, T)).toBe(`산소 ${formatSensor('oxygen', sensorValue('oxygen', null, T))}`);
    expect(sensorLine('generator', null, T)).toMatch(/^발전기 출력 \d+kW$/);
  });
});
