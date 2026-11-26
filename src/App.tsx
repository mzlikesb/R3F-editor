import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

export function App() {
  return (
    <Canvas camera={{ position: [3, 2.5, 4], fov: 50 }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry />
        <meshStandardMaterial color="#4f8cff" />
      </mesh>
      <OrbitControls makeDefault />
    </Canvas>
  );
}
