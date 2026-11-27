import { describe, expect, it } from 'vitest';
import type { Fault } from '../../shared/protocol';
import type { BaseView } from '../sync';
import {
  agoText,
  bestUptimeMs,
  blackoutBanner,
  connectionLabel,
  formatDuration,
  faultCountLine,
  healthyLine,
  historyView,
  hudReady,
  lastRepairLine,
  panelView,
  peopleLine,
  segments,
  togetherLine,
  uptimeLine,
  updateBanner,
} from './view';

const T = 1_800_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('formatDuration', () => {
  it('reads coarse: seconds, minutes, hours (+ minutes), days (+ hours)', () => {
    expect(formatDuration(0)).toBe('0초');
    expect(formatDuration(-500)).toBe('0초');
    expect(formatDuration(45_900)).toBe('45초');
    expect(formatDuration(MIN)).toBe('1분');
    expect(formatDuration(12 * MIN + 59_000)).toBe('12분');
    expect(formatDuration(3 * HOUR)).toBe('3시간');
    expect(formatDuration(3 * HOUR + 12 * MIN + 30_000)).toBe('3시간 12분');
    expect(formatDuration(48 * HOUR)).toBe('2일');
    expect(formatDuration(53 * HOUR + 40 * MIN)).toBe('2일 5시간');
  });
});

describe('agoText', () => {
  it('counts back from now', () => {
    expect(agoText(-100)).toBe('방금');
    expect(agoText(4_999)).toBe('방금');
    expect(agoText(5_000)).toBe('5초 전');
    expect(agoText(59_999)).toBe('59초 전');
    expect(agoText(MIN)).toBe('1분 전');
    expect(agoText(2 * HOUR + 5 * MIN)).toBe('2시간 전');
    expect(agoText(4 * 24 * HOUR)).toBe('4일 전');
  });
});

describe('HUD top line (uptime)', () => {
  const running = { uptimeStartedAt: T - (3 * HOUR + 12 * MIN), longestUptimeMs: HOUR, blackout: null };

  it('shows the uptime', () => {
    expect(uptimeLine(running, T)).toBe('가동 3시간 12분');
  });

  it('in a blackout says the record broke and shows the longest', () => {
    const dark = { uptimeStartedAt: null, longestUptimeMs: 5 * HOUR, blackout: { id: 'b', startedAt: T } };
    expect(uptimeLine(dark, T)).toBe('가동 기록 끊김 · 최장 5시간');
  });

  it('longest is never shorter than the current run', () => {
    expect(bestUptimeMs(running, T)).toBe(3 * HOUR + 12 * MIN);
    expect(bestUptimeMs({ ...running, longestUptimeMs: 9 * HOUR }, T)).toBe(9 * HOUR);
    expect(bestUptimeMs({ uptimeStartedAt: null, longestUptimeMs: 0, blackout: { id: 'b', startedAt: T } }, T)).toBe(0);
  });
});

describe('HUD people line (playtest #47: short enough for a phone)', () => {
  it('repairs and people on one line', () => {
    expect(peopleLine(0, 3)).toBe('함께 고친 0회 · 3명 접속 중');
    expect(peopleLine(12, 2)).toBe('함께 고친 12회 · 2명 접속 중');
  });

  it('alone', () => {
    expect(peopleLine(4, 1)).toBe('함께 고친 4회 · 나 혼자 접속 중');
    expect(peopleLine(4, 0)).toBe('함께 고친 4회 · 나 혼자 접속 중');
  });

  it('connection label and healthy line', () => {
    expect(connectionLabel('open')).toBeNull();
    expect(connectionLabel('reconnecting')).toBe('재연결 중…');
    expect(healthyLine({ faulted: false })).toBe('기지 정상 · 고장이 나면 이 화면에 떠요');
    expect(healthyLine({ faulted: true })).toBeNull();
  });
});

describe('segments: wrap only between parts, never inside `0회` or `1분 전`', () => {
  it('splits on the middle dot', () => {
    expect(segments('마지막: 다른 사람 · 산소 탱크 · 25초 전')).toEqual(['마지막: 다른 사람', '산소 탱크', '25초 전']);
    expect(segments('가동 3분')).toEqual(['가동 3분']);
  });
});

describe('faultCountLine: how close the blackout is', () => {
  it('shows the count and the blackout threshold while something is broken and it is not dark yet', () => {
    expect(faultCountLine(1, null)).toBe('고장 1개 · 3개가 되면 정전 — 기지 불이 꺼져요');
    expect(faultCountLine(2, null)).toBe('고장 2개 · 3개가 되면 정전 — 기지 불이 꺼져요');
  });

  it('nothing when healthy or during a blackout (the blackout banner says it)', () => {
    expect(faultCountLine(0, null)).toBeNull();
    expect(faultCountLine(3, { id: 'b', startedAt: T })).toBeNull();
    expect(faultCountLine(2, { id: 'b', startedAt: T })).toBeNull();
  });
});

describe('hudReady: nothing claims "healthy" while loading', () => {
  it('needs the scene and the base', () => {
    expect(hudReady({ loaded: false, hasBase: false, incompatible: false })).toBe(false);
    expect(hudReady({ loaded: true, hasBase: false, incompatible: false })).toBe(false);
    expect(hudReady({ loaded: false, hasBase: true, incompatible: false })).toBe(false);
    expect(hudReady({ loaded: true, hasBase: true, incompatible: false })).toBe(true);
  });

  it('an unreadable server does not leave it loading forever', () => {
    expect(hudReady({ loaded: true, hasBase: false, incompatible: true })).toBe(true);
  });
});

describe('banners', () => {
  it('blackout banner only during a blackout', () => {
    expect(blackoutBanner({ id: 'b', startedAt: T })).toBe('정전 — 발전기를 고쳐야 불이 돌아와요');
    expect(blackoutBanner(null)).toBeNull();
  });

  it('update banner only when the protocol is incompatible', () => {
    expect(updateBanner(true)).toBe('새 버전이 나왔어요 · 새로고침');
    expect(updateBanner(false)).toBeNull();
  });
});

describe('lastRepairLine', () => {
  const last = (mine: boolean | null, helpers = 0, moduleId: 'oxygen' | 'comms' = 'oxygen') => ({
    moduleId,
    at: T,
    mine,
    helpers,
  });

  it('says who and which module', () => {
    expect(lastRepairLine(last(true), T + 1000)).toBe('마지막: 나 · 산소 탱크 · 방금');
    expect(lastRepairLine(last(false), T + 12_400)).toBe('마지막: 다른 사람 · 산소 탱크 · 12초 전');
  });

  it('counts the helpers after whoever made it count (#56)', () => {
    expect(lastRepairLine(last(true, 1), T + 1000)).toBe('마지막: 나 외 1명 · 산소 탱크 · 방금');
    expect(lastRepairLine(last(true, 2), T + 1000)).toBe('마지막: 나 외 2명 · 산소 탱크 · 방금');
    expect(lastRepairLine(last(false, 2), T + 1000)).toBe('마지막: 다른 사람 외 2명 · 산소 탱크 · 방금');
  });

  it('leaves out who when it came from a snapshot', () => {
    expect(lastRepairLine(last(null, 0, 'comms'), T + 3 * MIN)).toBe('마지막: 통신탑 · 3분 전');
  });

  it('shows nothing without a repair', () => {
    expect(lastRepairLine(null, T)).toBeNull();
  });
});

describe('togetherLine (others holding, already excluding me)', () => {
  it('shows only for one or more', () => {
    expect(togetherLine(0)).toBeNull();
    expect(togetherLine(1)).toBe('지금 1명이 같이 누르는 중');
    expect(togetherLine(3)).toBe('지금 3명이 같이 누르는 중');
  });
});

describe('panelView', () => {
  const oxy: Fault = { id: 'f1', moduleId: 'oxygen', createdAt: T - 9000 };
  const comms: Fault = { id: 'c1', moduleId: 'comms', createdAt: T - 8000 };
  const gen: Fault = { id: 'g1', moduleId: 'generator', createdAt: T - 7000 };

  it('a broken module offers its repair and says who else is on it', () => {
    expect(panelView('comms', { faults: [oxy, comms], blackout: null, othersHolding: 1 })).toEqual({
      title: '통신탑',
      status: 'fault',
      repairFaultId: 'c1',
      goTo: null,
      together: '지금 1명이 같이 누르는 중',
    });
  });

  it('a fine module points to the oldest fault', () => {
    expect(panelView('habitat', { faults: [oxy, comms], blackout: null, othersHolding: 0 })).toEqual({
      title: '거주 돔',
      status: 'ok',
      repairFaultId: null,
      goTo: { moduleId: 'oxygen', label: '산소 탱크 고장 — 눌러서 이동' },
      together: null,
    });
  });

  it('(d) during a blackout a fine module points to the generator', () => {
    const view = panelView('habitat', {
      faults: [oxy, comms, gen],
      blackout: { id: 'b', startedAt: T },
      othersHolding: 0,
    });
    expect(view.goTo).toEqual({ moduleId: 'generator', label: '발전기 고장 — 눌러서 이동' });
  });

  it('nothing broken: nothing to press', () => {
    expect(panelView('generator', { faults: [], blackout: null, othersHolding: 0 })).toEqual({
      title: '발전기',
      status: 'ok',
      repairFaultId: null,
      goTo: null,
      together: null,
    });
  });
});

describe('historyView', () => {
  const base: BaseView = {
    faults: [],
    repairs: 3,
    version: 9,
    instanceId: 'i',
    uptimeStartedAt: T - (2 * HOUR + 5 * MIN),
    longestUptimeMs: 5 * HOUR,
    blackout: null,
    blackouts: [
      { id: 'b2', startedAt: T - 12 * MIN - 4 * MIN, endedAt: T - 12 * MIN },
      { id: 'b1', startedAt: T - 3 * HOUR, endedAt: T - 3 * HOUR + 90_000 },
    ],
    lastRepair: null,
  };

  it('shows the current and longest uptime and the recent blackouts', () => {
    expect(historyView(base, T)).toEqual({
      current: '2시간 5분',
      longest: '5시간',
      blackouts: ['16분 전 · 4분 동안', '3시간 전 · 1분 동안'],
    });
  });

  it('during a blackout: current is "정전 중" and the open record is "진행 중"', () => {
    const dark: BaseView = {
      ...base,
      uptimeStartedAt: null,
      blackout: { id: 'b3', startedAt: T - 2000 },
      blackouts: [{ id: 'b3', startedAt: T - 2000, endedAt: null }, ...base.blackouts],
    };
    const view = historyView(dark, T);
    expect(view.current).toBe('정전 중');
    expect(view.blackouts[0]).toBe('방금 · 진행 중');
  });

  it('(neon round 2) the longest is the current run when that is longer', () => {
    expect(historyView({ ...base, longestUptimeMs: 0 }, T).longest).toBe('2시간 5분');
  });
});
