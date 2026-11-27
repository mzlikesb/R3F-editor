import { describe, expect, it } from 'vitest';
import { connectionLabel, healthyLine, lastRepairLine, panelView, presenceLine, repairsLine } from './view';

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
    expect(healthyLine({ faulted: false })).toBe('기지 정상 · 고장 나면 알려 드려요');
    expect(healthyLine({ faulted: true })).toBeNull();
    expect(healthyLine(null)).toBeNull();
  });
});

describe('lastRepairLine', () => {
  const at = 10_000;

  it('shows nothing until a repair happened while this tab was open', () => {
    expect(lastRepairLine(null, at)).toBeNull();
  });

  it('says who repaired: me or someone else (beaten counts as someone else)', () => {
    expect(lastRepairLine({ outcome: 'mine', at }, at + 1000)).toBe('마지막 수리: 나 · 방금');
    expect(lastRepairLine({ outcome: 'other', at }, at + 1000)).toBe('마지막 수리: 다른 사람 · 방금');
    expect(lastRepairLine({ outcome: 'beaten', at }, at + 1000)).toBe('마지막 수리: 다른 사람 · 방금');
  });

  it('counts seconds, then minutes, then hours on the client clock', () => {
    const line = (ms: number) => lastRepairLine({ outcome: 'other', at }, at + ms);
    expect(line(4_999)).toBe('마지막 수리: 다른 사람 · 방금');
    expect(line(5_000)).toBe('마지막 수리: 다른 사람 · 5초 전');
    expect(line(12_400)).toBe('마지막 수리: 다른 사람 · 12초 전');
    expect(line(59_999)).toBe('마지막 수리: 다른 사람 · 59초 전');
    expect(line(60_000)).toBe('마지막 수리: 다른 사람 · 1분 전');
    expect(line(59 * 60_000 + 59_999)).toBe('마지막 수리: 다른 사람 · 59분 전');
    expect(line(3 * 3_600_000)).toBe('마지막 수리: 다른 사람 · 3시간 전');
  });

  it('treats a clock that went backwards as just now', () => {
    expect(lastRepairLine({ outcome: 'mine', at }, at - 500)).toBe('마지막 수리: 나 · 방금');
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
