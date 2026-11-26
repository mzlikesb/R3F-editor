import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { MeshStandardMaterial } from 'three';
import { GENERATOR } from '../../shared/protocol';
import { useStore } from '../store';

const CALM = '#3f8f5a';
const ALERT = '#d63a3a';

export function Generator() {
  const faulted = useStore((s) => s.sync.base?.fault != null);
  const selected = useStore((s) => s.selected === GENERATOR);
  const material = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    const broken = useStore.getState().sync.base?.fault != null;
    m.emissiveIntensity = broken ? 0.55 + 0.45 * Math.sin(clock.elapsedTime * 5) : 0;
  });

  return (
    <group position={[0, 0.5, 0]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          useStore.getState().select(GENERATOR);
        }}
      >
        <boxGeometry />
        <meshStandardMaterial ref={material} color={faulted ? ALERT : CALM} emissive={ALERT} emissiveIntensity={0} />
      </mesh>
      {(faulted || selected) && (
        <Html center position={[0, 1.1, 0]} pointerEvents="none" style={{ pointerEvents: 'none' }}>
          <div className={faulted ? 'badge badge-fault' : 'badge'}>{faulted ? '⚠ 고장' : '발전기'}</div>
        </Html>
      )}
    </group>
  );
}
