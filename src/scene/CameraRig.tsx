import { CameraControls } from '@react-three/drei';
import type { CameraControls as CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { useStore } from '../store';
import {
  focusPose,
  nearestAzimuth,
  outwardAzimuth,
  MAX_POLAR,
  maxCameraDistance,
  overviewPose,
  overviewReturnPose,
  polarPose,
} from './cameraPath';
import { overviewFov } from './framing';
import { BOUNDS, LAYOUT, OVERVIEW_TARGET } from './layout';

const PHONE = '(max-width: 600px)';

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
    const changed = first.current || lastSelected.current !== selected;
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
      // Releasing a selection (or the first frame) goes back to the first screen's direction; a resize
      // while looking around keeps the azimuth the player orbited to. The fit distance depends on it.
      const pose = changed
        ? overviewReturnPose(az, fov, width, height)
        : { ...overviewPose(az, fov, width, height), azimuth: az };
      const { dir, distance: dist, lift, azimuth: toAz } = pose;
      const { polar } = polarPose(Math.hypot(dir.x, dir.z), dir.y);
      // A portrait screen lifts the camera so the base rests just above the bottom UI (008 A.2).
      void c.setFocalOffset(0, -lift * dist, 0, animate);
      if (animate) {
        void c.setTarget(t.x, t.y, t.z, true);
        void c.rotateTo(toAz, polar, true);
        void c.dollyTo(dist, true);
        return;
      }
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
    const f = focusPose(selected, phone);
    void c.setFocalOffset(0, f.offset, 0, animate);
    if (animate) {
      const pref = outwardAzimuth(l.x, l.z, az);
      void c.setTarget(f.target.x, f.target.y, f.target.z, true);
      void c.rotateTo(nearestAzimuth(az, pref), f.polar, true);
      void c.dollyTo(f.distance, true);
      return;
    }
    const len = Math.hypot(l.x, l.z);
    const dx = len > 0.01 ? l.x / len : 0;
    const dz = len > 0.01 ? l.z / len : 1;
    void c.setLookAt(
      l.x + dx * f.horizontal,
      f.height,
      l.z + dz * f.horizontal,
      f.target.x,
      f.target.y,
      f.target.z,
      false,
    );
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
