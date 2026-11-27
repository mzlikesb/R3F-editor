import { CameraControls } from '@react-three/drei';
import type { CameraControls as CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { useStore } from '../store';
import {
  nearestAzimuth,
  outwardAzimuth,
  overviewDirAt,
  MAX_POLAR,
  maxCameraDistance,
  overviewDistanceAt,
  polarPose,
} from './cameraPath';
import { overviewFov } from './framing';
import { BOUNDS, LAYOUT, OVERVIEW_DIR, OVERVIEW_TARGET } from './layout';

const PHONE = '(max-width: 600px)';
/** A portrait phone sees a much narrower slice horizontally, so focus from further away. */
const PHONE_FOCUS_SCALE = 1.7;
/** Focused module's look-at height (world). Kept above the boundary floor so panning never snaps it. */
const FOCUS_Y = 0.8;
/**
 * Screen-space shift of the focused module, as a fraction of the camera distance (CameraControls
 * focal offset, camera-up axis; negative moves the module down the screen). Both push it a little
 * down so its badge or name tag clears the HUD; on a phone the steeper, farther camera already keeps
 * it above the bottom panel.
 */
const FOCUS_OFFSET = { desktop: -0.06, phone: -0.08 } as const;

/**
 * One CameraControls: orbit/zoom/pan by hand, smooth focus on the selected module, back to the whole
 * base when nothing is selected. The overview distance and field of view follow the screen shape, so
 * a portrait phone shows all five modules.
 */
export function CameraRig() {
  const controls = useRef<CameraControlsImpl>(null);
  const first = useRef(true);
  const lastSelected = useRef<string | null>(null);
  const selected = useStore((s) => s.selected);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const { fov, maxDistance } = useMemo(() => {
    const f = overviewFov(width / Math.max(1, height));
    return { fov: f, maxDistance: maxCameraDistance(f, width, height) };
  }, [width, height]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.setBoundary(new Box3(new Vector3(-BOUNDS, 0, -BOUNDS), new Vector3(BOUNDS, 4, BOUNDS)));
  }, []);

  useEffect(() => {
    const c = controls.current;
    if (!c || width === 0 || height === 0) return;
    const phone = window.matchMedia(PHONE).matches;
    // Animate only when the selection changed; a resize or the first frame jumps.
    const animate = !first.current && lastSelected.current !== selected;
    first.current = false;
    lastSelected.current = selected;

    const cam = c.camera;
    if (cam instanceof PerspectiveCamera && cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // A selection change turns the camera the short way from where it is now: the target, azimuth,
    // polar angle and distance all ease together over one smoothTime. A jump (first frame, resize)
    // snaps to the fixed pose instead.
    if (animate) void c.normalizeRotations();
    const az = c.azimuthAngle;
    if (selected === null) {
      const t = OVERVIEW_TARGET;
      const { polar } = polarPose(Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.z), OVERVIEW_DIR.y);
      // Fit for the azimuth we keep: the fit distance depends on the viewing direction.
      const dist = overviewDistanceAt(az, fov, width, height);
      void c.setFocalOffset(0, 0, 0, animate);
      if (animate) {
        void c.setTarget(t.x, t.y, t.z, true);
        void c.rotateTo(az, polar, true);
        void c.dollyTo(dist, true);
        return;
      }
      const dir = overviewDirAt(az);
      const len = Math.hypot(dir.x, dir.y, dir.z);
      void c.setLookAt(
        t.x + (dir.x / len) * dist,
        t.y + (dir.y / len) * dist,
        t.z + (dir.z / len) * dist,
        t.x,
        t.y,
        t.z,
        false,
      );
      return;
    }
    const l = LAYOUT[selected];
    const fd = l.focusDistance * (phone ? PHONE_FOCUS_SCALE : 1);
    const cy = phone ? fd * 1.15 : fd * 0.55;
    const { polar, distance } = polarPose(fd, cy);
    const offset = (phone ? FOCUS_OFFSET.phone : FOCUS_OFFSET.desktop) * distance;
    void c.setFocalOffset(0, offset, 0, animate);
    if (animate) {
      const pref = outwardAzimuth(l.x, l.z, az);
      void c.setTarget(l.x, FOCUS_Y, l.z, true);
      void c.rotateTo(nearestAzimuth(az, pref), polar, true);
      void c.dollyTo(distance, true);
      return;
    }
    const len = Math.hypot(l.x, l.z);
    const dx = len > 0.01 ? l.x / len : 0;
    const dz = len > 0.01 ? l.z / len : 1;
    void c.setLookAt(l.x + dx * fd, cy, l.z + dz * fd, l.x, FOCUS_Y, l.z, false);
  }, [selected, width, height, fov]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      maxPolarAngle={MAX_POLAR}
      minDistance={3}
      maxDistance={maxDistance}
      smoothTime={0.35}
    />
  );
}
