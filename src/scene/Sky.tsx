import { useMemo } from 'react';
import { Float32BufferAttribute } from 'three';
import { starPositions } from './stars';

/** Page-level gradient behind the transparent canvas (dark sky blue, not pure black). */
export const SKY_GRADIENT = 'linear-gradient(180deg, #070b18 0%, #14233f 48%, #2b3f5e 100%)';

/** The same sky in a blackout, faded in over the normal one (`.sky-dark`). */
export const SKY_GRADIENT_DARK = 'linear-gradient(180deg, #020309 0%, #060b16 48%, #0d141f 100%)';

export function Stars() {
  const positions = useMemo(() => new Float32BufferAttribute(starPositions(), 3), []);
  return (
    <points raycast={() => null}>
      <bufferGeometry attributes={{ position: positions }} />
      <pointsMaterial color="#dfe8ff" size={2} sizeAttenuation={false} fog={false} depthWrite={false} />
    </points>
  );
}
