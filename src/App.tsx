import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { loadBase } from './net/api';
import { startSocket } from './net/socket';
import { Generator } from './scene/Generator';
import { useStore } from './store';
import { Hud } from './ui/Hud';
import { Panel } from './ui/Panel';

export function App() {
  useEffect(() => {
    void loadBase();
    return startSocket();
  }, []);

  return (
    <>
      <Canvas camera={{ position: [3, 2.5, 4], fov: 50 }} onPointerMissed={() => useStore.getState().select(null)}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 3]} intensity={1.2} />
        <Generator />
        <OrbitControls makeDefault />
      </Canvas>
      <Hud />
      <Panel />
    </>
  );
}
