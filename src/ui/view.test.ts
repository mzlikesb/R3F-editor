import { describe, expect, it } from 'vitest';
import { connectionLabel, healthyLine, panelView, presenceLine, repairsLine } from './view';

describe('HUD lines', () => {
  it('counts repairs together', () => {
    expect(repairsLine(12)).toBe('함께 고친 횟수 12회');
    expect(repairsLine(0)).toBe('함께 고친 횟수 0회');
    expect(repairsLine(undefined)).toBe('함께 고친 횟수 –회');
  });

  it('says who is keeping the base', () => {
    expect(presenceLine(3)).toBe('지금 3명이 같이 지키는 중');
    expect(presenceLine(2)).toBe('지금 2명이 같이 지키는 중');
    expect(presenceLine(1)).toBe('지금은 나 혼자 지키는 중');
    expect(presenceLine(0)).toBe('지금은 나 혼자 지키는 중');
  });

  it('shows the connection only when it is not open', () => {
    expect(connectionLabel('open')).toBeNull();
    expect(connectionLabel('connecting')).toBe('연결 중…');
    expect(connectionLabel('reconnecting')).toBe('재연결 중…');
  });

  it('shows the healthy line only when a base is known and nothing is broken', () => {
    expect(healthyLine({ faulted: false })).toBe('기지 정상 가동 중 · 고장이 나면 여기에 알려 드려요');
    expect(healthyLine({ faulted: true })).toBeNull();
    expect(healthyLine(null)).toBeNull();
  });
});

describe('panelView', () => {
  it('offers the repair on the broken generator', () => {
    expect(panelView('generator', true)).toEqual({
      title: '발전기',
      status: 'fault',
      repairButton: true,
      goToFault: false,
    });
  });

  it('shows a healthy generator as normal, with nothing to press', () => {
    expect(panelView('generator', false)).toEqual({
      title: '발전기',
      status: 'ok',
      repairButton: false,
      goToFault: false,
    });
  });

  it('shows another module as normal, with a way back to the broken generator', () => {
    expect(panelView('greenhouse', true)).toEqual({
      title: '온실',
      status: 'ok',
      repairButton: false,
      goToFault: true,
    });
  });

  it('shows another module as normal when nothing is broken', () => {
    expect(panelView('comms', false)).toEqual({ title: '통신탑', status: 'ok', repairButton: false, goToFault: false });
  });
});
