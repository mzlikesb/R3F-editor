import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../../shared/protocol';
import { focusPose } from './cameraPath';
import { overviewFov, project, type FrameSpec } from './framing';
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

function topPx(id: (typeof MODULE_IDS)[number], s: (typeof SCREENS)[number]): number {
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
  const top = { x: l.x, y: MODEL_BOUNDS[id].height * l.scale, z: l.z };
  const n = project(spec, f.distance, top);
  return ((1 - n.y) / 2) * s.height;
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
