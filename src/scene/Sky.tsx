import { useMemo } from 'react';
import { Float32BufferAttribute } from 'three';
import { starPositions } from './stars';

/** The sky gradient itself is the scene background (`SceneTone`). */
export function Stars() {
  const positions = useMemo(() => new Float32BufferAttribute(starPositions(), 3), []);
  return (
    <points raycast={() => null}>
      <bufferGeometry attributes={{ position: positions }} />
      <pointsMaterial color="#dfe8ff" size={2} sizeAttenuation={false} fog={false} depthWrite={false} />
    </points>
  );
}
