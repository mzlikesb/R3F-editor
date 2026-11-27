import { useMemo } from 'react';
import { Float32BufferAttribute } from 'three';

const STARS = 90;
const RADIUS = 110;

/** Page-level gradient behind the transparent canvas (dark sky blue, not pure black). */
export const SKY_GRADIENT = 'linear-gradient(180deg, #070b18 0%, #14233f 48%, #2b3f5e 100%)';

/** The same sky in a blackout, faded in over the normal one (`.sky-dark`). */
export const SKY_GRADIENT_DARK = 'linear-gradient(180deg, #020309 0%, #060b16 48%, #0d141f 100%)';

/** A few fixed stars on the upper hemisphere. Deterministic so every client sees the same sky. */
export function Stars() {
  const positions = useMemo(() => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const out: number[] = [];
    for (let i = 0; i < STARS; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = 0.15 + rand() * 1.1;
      out.push(
        Math.cos(theta) * Math.cos(phi) * RADIUS,
        Math.sin(phi) * RADIUS,
        Math.sin(theta) * Math.cos(phi) * RADIUS,
      );
    }
    return new Float32BufferAttribute(out, 3);
  }, []);
  return (
    <points raycast={() => null}>
      <bufferGeometry attributes={{ position: positions }} />
      <pointsMaterial color="#dfe8ff" size={2} sizeAttenuation={false} fog={false} depthWrite={false} />
    </points>
  );
}
