import { useLayoutEffect, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, MeshBasicMaterial, SphereGeometry, SpriteMaterial, Vector3 } from 'three';
import type { Group } from 'three';
import { PALETTE } from '../palette';

/** World-space size of the dot, the same on every module whatever its model scale. */
const LIGHT_RADIUS = 0.17;
/** World-space gap between the model's top and the dot. */
const LIFT = 0.3;
/** World-space size of the soft glow behind the dot (smaller since neon: a near module's glow was loud). */
const GLOW_SIZE = 0.75;
/** World-space height of the glow's top above the model's top: name tags hang above this. */
export const STATUS_LIGHT_TOP = LIFT + GLOW_SIZE / 2;

const LIGHT_GEOMETRY = new SphereGeometry(1, 12, 8);
const LIGHT_MATERIAL = new MeshBasicMaterial({ color: PALETTE.statusLight, toneMapped: false, fog: false });

let glowMaterial: SpriteMaterial | null = null;

/** One small additive glow material shared by every status light (created on first use, never per frame). */
function getGlowMaterial(): SpriteMaterial {
  if (glowMaterial) return glowMaterial;
  let map: CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(120,255,170,0.9)');
      g.addColorStop(0.4, 'rgba(74,222,128,0.35)');
      g.addColorStop(1, 'rgba(74,222,128,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
      map = new CanvasTexture(canvas);
    }
  }
  glowMaterial = new SpriteMaterial({
    map,
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  return glowMaterial;
}

const worldScale = new Vector3();

/**
 * The green dot of a healthy module, a little above its top, with a soft additive glow. Its group
 * undoes the module's own scale, so every module's dot looks the same size on screen.
 */
export function StatusLight({ height }: { height: number }) {
  const group = useRef<Group>(null);

  useLayoutEffect(() => {
    const g = group.current;
    const parent = g?.parent;
    if (!g || !parent) return;
    parent.updateWorldMatrix(true, false);
    parent.getWorldScale(worldScale);
    const s = worldScale.x || 1;
    g.scale.setScalar(1 / s);
    g.position.y = height + LIFT / s;
  }, [height]);

  return (
    <group ref={group}>
      <mesh geometry={LIGHT_GEOMETRY} material={LIGHT_MATERIAL} scale={LIGHT_RADIUS} raycast={() => null} />
      <sprite material={getGlowMaterial()} scale={[GLOW_SIZE, GLOW_SIZE, 1]} raycast={() => null} />
    </group>
  );
}
