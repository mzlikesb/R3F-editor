import { useMemo } from 'react';
import { CircleGeometry, Float32BufferAttribute, RingGeometry } from 'three';
import { GROUND_FADE_RADIUS, GROUND_RADIUS } from './layout';
import { PALETTE } from './palette';

const SEGMENTS = 96;
/** Rings across the fade, so the alpha follows a smooth curve instead of one straight ramp. */
const FADE_RINGS = 6;
const COLOR = PALETTE.ground;

const noRaycast = () => null;

/**
 * Edge of the disc fading into the page sky: vertex alpha from 1 at `GROUND_RADIUS` to 0 at
 * `GROUND_FADE_RADIUS` (smoothstep). No shader added; the fog has taken the ground to the sky's
 * bottom colour by then and the scene background (the sky, `SceneTone`) shows through, in daylight
 * and in a blackout (plan 007 A.0, 008 A.3).
 */
function fadeGeometry(): RingGeometry {
  const g = new RingGeometry(GROUND_RADIUS, GROUND_FADE_RADIUS, SEGMENTS, FADE_RINGS);
  const pos = g.getAttribute('position');
  const rgba = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = (Math.hypot(pos.getX(i), pos.getY(i)) - GROUND_RADIUS) / (GROUND_FADE_RADIUS - GROUND_RADIUS);
    const s = Math.min(1, Math.max(0, t));
    rgba.set([1, 1, 1, 1 - s * s * (3 - 2 * s)], i * 4);
  }
  g.setAttribute('color', new Float32BufferAttribute(rgba, 4));
  return g;
}

/**
 * The planet surface: an opaque disc under all the scenery and a transparent rim that fades out.
 * Most of the ground stays opaque (no blending); only the rim blends, and it is drawn first among
 * transparent objects (`renderOrder`) so the fault rings and glows lying on the ground are never
 * painted over; it writes no depth. Only the disc receives shadows (the rim is outside the shadow
 * camera). Neither takes raycasts (a tap there is empty space).
 */
export function Ground() {
  const disc = useMemo(() => new CircleGeometry(GROUND_RADIUS, SEGMENTS), []);
  const rim = useMemo(() => fadeGeometry(), []);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={disc} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={COLOR} roughness={1} metalness={0} />
      </mesh>
      <mesh geometry={rim} raycast={noRaycast} renderOrder={-1}>
        <meshStandardMaterial color={COLOR} roughness={1} metalness={0} vertexColors transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
