import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, Color, Fog, SRGBColorSpace, Vector3 } from 'three';
import { selectBlackout, useStore } from '../store';
import { darkness, daylight, stepDaylight } from './blackout';
import { fogRange } from './fog';
import { PALETTE } from './palette';

/** A 4 x 256 vertical gradient, top of the screen to the bottom: the old CSS sky. */
function skyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, canvas.height);
  const [top, mid, bottom] = PALETTE.sky;
  grad.addColorStop(0, top);
  grad.addColorStop(PALETTE.skyMid, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const FOG_DAY = new Color(PALETTE.fog);
/** The one fog; its near/far and colour are rewritten every frame. */
const FOG = new Fog(FOG_DAY.clone(), 40, 120);
const target = new Vector3();
const range = { near: 0, far: 0 };

/**
 * Sky, fog and the blackout fade, together (plan 008 A.3, B.2). The sky is a screen-space gradient
 * texture as the scene background, so the sky, the fog and the ground go through the same render
 * (the canvas no longer needs to be transparent over a CSS sky). The fog takes the sky's bottom
 * colour. One blackout progress (`daylight`, stepped here first each frame and read by `Lighting`)
 * dims the lights, the sky (`backgroundIntensity`) and the fog colour by the same factor, so the far
 * ground keeps melting into the sky in a blackout. Nothing is allocated per frame.
 */
export function SceneTone() {
  const get = useThree((s) => s.get);
  const sky = useMemo(() => skyTexture(), []);

  useEffect(() => {
    const scene = get().scene;
    scene.background = sky;
    scene.fog = FOG;
    return () => {
      scene.background = null;
      scene.fog = null;
      sky.dispose();
    };
  }, [get, sky]);

  useFrame(({ scene, camera, controls }, delta) => {
    daylight.level = stepDaylight(daylight.level, selectBlackout(useStore.getState()), delta);
    const k = 1 + (PALETTE.skyBlackout - 1) * darkness(daylight.level);
    scene.backgroundIntensity = k;
    FOG.color.copy(FOG_DAY).multiplyScalar(k);

    const c = controls as { getTarget?: (out: Vector3) => Vector3 } | null;
    if (c?.getTarget) c.getTarget(target);
    fogRange(camera.position.distanceTo(target), target, range);
    FOG.near = range.near;
    FOG.far = range.far;
  });

  return null;
}
