import { describe, expect, it } from 'vitest';
import { nearestAzimuth, outwardAzimuth, polarPose, wrapAngle } from './cameraPath';

const deg = (d: number) => (d * Math.PI) / 180;

describe('wrapAngle', () => {
  it('keeps small angles', () => {
    expect(wrapAngle(deg(30))).toBeCloseTo(deg(30));
    expect(wrapAngle(deg(-30))).toBeCloseTo(deg(-30));
  });
  it('wraps past a half turn the short way', () => {
    expect(wrapAngle(deg(358))).toBeCloseTo(deg(-2));
    expect(wrapAngle(deg(-358))).toBeCloseTo(deg(2));
    expect(wrapAngle(deg(720 + 10))).toBeCloseTo(deg(10));
  });
  it('maps the half-turn boundary to +PI, never -PI', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('nearestAzimuth', () => {
  it('turns 2 degrees from 179 to -179', () => {
    const r = nearestAzimuth(deg(179), deg(-179));
    expect(r).toBeCloseTo(deg(181));
    expect(Math.abs(r - deg(179))).toBeCloseTo(deg(2));
  });
  it('turns 2 degrees the other way too', () => {
    expect(Math.abs(nearestAzimuth(deg(-179), deg(179)) - deg(-179))).toBeCloseTo(deg(2));
  });
  it('never turns more than half a circle, including the 0 to PI boundary', () => {
    for (const cur of [0, 1, -3, 7, -9.5, 20]) {
      for (const pref of [0, Math.PI, -Math.PI, 2, -2.5]) {
        const r = nearestAzimuth(cur, pref);
        expect(Math.abs(r - cur)).toBeLessThanOrEqual(Math.PI + 1e-9);
        expect(Math.cos(r)).toBeCloseTo(Math.cos(pref));
        expect(Math.sin(r)).toBeCloseTo(Math.sin(pref));
      }
    }
  });
  it('stays put when already facing the preferred way', () => {
    expect(nearestAzimuth(deg(400), deg(40))).toBeCloseTo(deg(400));
  });
  it('follows an unbounded current angle', () => {
    expect(nearestAzimuth(deg(700), deg(-10))).toBeCloseTo(deg(710));
  });
});

describe('outwardAzimuth', () => {
  it('points along the outward offset', () => {
    expect(outwardAzimuth(0, 5, 1)).toBeCloseTo(0);
    expect(outwardAzimuth(5, 0, 1)).toBeCloseTo(Math.PI / 2);
    expect(outwardAzimuth(0, -5, 1)).toBeCloseTo(Math.PI);
  });
  it('uses the fallback at the centre', () => {
    expect(outwardAzimuth(0, 0, 1.25)).toBe(1.25);
  });
});

describe('polarPose', () => {
  it('derives polar angle and distance', () => {
    const p = polarPose(3, 4);
    expect(p.distance).toBeCloseTo(5);
    expect(p.polar).toBeCloseTo(Math.atan2(3, 4));
  });
});
