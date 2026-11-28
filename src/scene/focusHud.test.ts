import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../../shared/protocol';
import { focusPose } from './cameraPath';
import { overviewFov, project, type FrameSpec } from './framing';
import { BROKEN_TAG_LIFT, tagLift } from './fx/labelRules';
import { LAYOUT, MODEL_BOUNDS, OVERVIEW_MARGIN } from './layout';

/**
 * Selecting a module zooms in and shifts it down a little (`FOCUS_OFFSET`). Its top (the status
 * light and name tag hang above it) must stay under the HUD band, or the HUD hides the building
 * the player just tapped (pc-dev, #103). `OVERVIEW_MARGIN.top` is the band the HUD column occupies.
 */
const SCREENS = [
  { name: 'phone 390x844', width: 390, height: 844, phone: true },
  { name: 'phone 360x740', width: 360, height: 740, phone: true },
  { name: 'desktop 1280x800', width: 1280, height: 800, phone: false },
  { name: 'desktop 1024x640', width: 1024, height: 640, phone: false },
];

/** Room the status light, name tag or badge need above the model's top (about 60 px at these zooms). */
const LABEL_ROOM_PX = 60;

/** Screen y (px) of the point `lift` world units above the model's top, with the module focused. */
function topPx(id: (typeof MODULE_IDS)[number], s: (typeof SCREENS)[number], lift = 0) {
  const p = pinPx(id, s, lift);
  return p.y;
}

function pinPx(id: (typeof MODULE_IDS)[number], s: (typeof SCREENS)[number], lift: number) {
  const f = focusPose(id, s.phone);
  const l = LAYOUT[id];
  const len = Math.hypot(l.x, l.z);
  const dx = len > 0.01 ? l.x / len : 0;
  const dz = len > 0.01 ? l.z / len : 1;
  const spec: FrameSpec = {
    target: f.target,
    // CameraControls dollies to `distance` at `polar` from the target (an animated select).
    dir: { x: dx * Math.sin(f.polar), y: Math.cos(f.polar), z: dz * Math.sin(f.polar) },
    fovDeg: overviewFov(s.width / s.height),
    width: s.width,
    height: s.height,
    margin: OVERVIEW_MARGIN,
    // The focal offset moves the camera along its own up axis.
    lift: -f.offset / f.distance,
  };
  const at = (y: number) => {
    const n = project(spec, f.distance, { x: l.x, y, z: l.z });
    return { x: ((n.x + 1) / 2) * s.width, y: ((1 - n.y) / 2) * s.height };
  };
  const top = MODEL_BOUNDS[id].height * l.scale;
  return { ...at(top + lift), top: at(top) };
}

describe('focus keeps the selected module under the HUD (#103)', () => {
  for (const s of SCREENS) {
    for (const id of MODULE_IDS) {
      it(`${id} top and its label room are below the HUD band on ${s.name}`, () => {
        expect(topPx(id, s)).toBeGreaterThanOrEqual(OVERVIEW_MARGIN.top + LABEL_ROOM_PX);
      });
    }
  }
});

/** How far the pin's foot may hang above the roof it names, px: close enough to read as touching it. */
const PIN_REACH_PX = 22;

describe('a broken selected module: the name tag pin touches its roof (neon on #124)', () => {
  for (const s of SCREENS) {
    for (const id of MODULE_IDS) {
      it(`${id} on ${s.name}`, () => {
        const p = pinPx(id, s, tagLift(true, 0));
        expect(p.top.y - p.y).toBeLessThanOrEqual(PIN_REACH_PX);
        expect(BROKEN_TAG_LIFT).toBeLessThan(tagLift(false, 0.8));
      });
    }
  }

  it('the old lift left the pin far above the roof on a PC (what the screenshot showed)', () => {
    const pc = SCREENS[2]!;
    const p = pinPx('greenhouse', pc, tagLift(false, 0.825));
    expect(p.top.y - p.y).toBeGreaterThan(PIN_REACH_PX);
  });
});
