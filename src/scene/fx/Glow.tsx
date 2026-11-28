import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, Sprite, SpriteMaterial } from 'three';
import { registerFx } from './fxGain';
import { setOpacity, step, useOneShot } from './shared';

const GLOW_S = 0.55;

function createGlowTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,230,160,0.55)');
  g.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** One additive glow sprite that flares and fades on my repair. Blooms under the composer (`fxGain.ts`). */
export function Glow({ radius, height, token }: { radius: number; height: number; token: number }) {
  const sprite = useRef<Sprite>(null);
  const timerRef = useOneShot(token);
  const texture = useMemo(() => createGlowTexture(), []);
  const material = useMemo(() => {
    const m = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    registerFx(m, 'burst');
    return m;
  }, [texture]);
  useEffect(
    () => () => {
      material.dispose();
      texture?.dispose();
    },
    [material, texture],
  );

  useFrame((_, delta) => {
    const s = sprite.current;
    if (!s) return;
    const p = step(timerRef, delta, GLOW_S);
    if (p < 0) return;
    if (p >= 1) {
      s.visible = false;
      return;
    }
    const size = Math.max(radius, 0.4) * (2 + p * 2.5);
    s.visible = true;
    s.scale.set(size, size, 1);
    setOpacity(material, 0.9 * (1 - p) * (1 - p));
  });

  return <sprite ref={sprite} material={material} position-y={height * 0.5} visible={false} />;
}
