import { CameraControls } from '@react-three/drei';
import type { CameraControls as CameraControlsImpl } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { Box3, Vector3 } from 'three';
import { useStore } from '../store';
import { BOUNDS, LAYOUT, OVERVIEW } from './layout';

const PHONE = '(max-width: 600px)';

/**
 * One CameraControls: orbit/zoom/pan by hand, smooth focus on the selected module, back to the whole
 * base when nothing is selected. On a phone the focused view is raised so the bottom panel does not
 * cover the module.
 */
export function CameraRig() {
  const controls = useRef<CameraControlsImpl>(null);
  const first = useRef(true);
  const selected = useStore((s) => s.selected);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.setBoundary(new Box3(new Vector3(-BOUNDS, 0, -BOUNDS), new Vector3(BOUNDS, 4, BOUNDS)));
  }, []);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const phone = window.matchMedia(PHONE).matches;
    const animate = !first.current;
    first.current = false;
    if (selected === null) {
      const o = phone ? OVERVIEW.phone : OVERVIEW.desktop;
      void c.setLookAt(0, o.y, o.z, 0, 0.5, 0, animate);
      return;
    }
    const l = LAYOUT[selected];
    const len = Math.hypot(l.x, l.z);
    const dx = len > 0.01 ? l.x / len : 0;
    const dz = len > 0.01 ? l.z / len : 1;
    const d = l.focusDistance;
    const ty = phone ? -0.8 : 0.8;
    const cy = phone ? d * 1.15 : d * 0.55;
    void c.setLookAt(l.x + dx * d, cy, l.z + dz * d, l.x, ty, l.z, animate);
  }, [selected]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      maxPolarAngle={Math.PI * 0.47}
      minDistance={3}
      maxDistance={38}
      smoothTime={0.35}
    />
  );
}
