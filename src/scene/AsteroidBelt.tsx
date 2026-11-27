import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { type Group, IcosahedronGeometry, type InstancedMesh, MeshStandardMaterial } from 'three';
import { selectReady, useStore } from '../store';
import { ASTEROIDS, beltCount } from './asteroids';
import { fillInstances } from './instances';
import { useQuality } from './qualityStore';

/** One turn in ten minutes. */
const SPIN = (Math.PI * 2) / 600;
const noRaycast = () => null;

/**
 * The asteroid belt (plan 007 A.4): about 1,000 lumpy rocks (a 20-triangle icosahedron scaled per
 * axis) in one InstancedMesh, one draw call, no shadows, no taps. Matrices are written once; each
 * frame only the group turns. It surrounds the base, so it is never frustum culled. Quality stage 3
 * draws half: `count` drops the tail of an order that thins every part of the ring alike.
 */
export function AsteroidBelt() {
  const group = useRef<Group>(null);
  const mesh = useRef<InstancedMesh>(null);
  const ready = useStore(selectReady);
  const fraction = useQuality((s) => s.asteroidFraction);
  const res = useMemo(
    () => ({
      geometry: new IcosahedronGeometry(1, 0),
      material: new MeshStandardMaterial({
        color: '#8d857c',
        flatShading: true,
        metalness: 0,
        roughness: 1,
        fog: false,
      }),
    }),
    [],
  );

  useLayoutEffect(() => {
    if (mesh.current) fillInstances(mesh.current, ASTEROIDS);
  }, []);

  useLayoutEffect(() => {
    if (mesh.current) mesh.current.count = beltCount(fraction);
  }, [fraction]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * SPIN;
  });

  return (
    // Hidden with the rest of the loading state (`selectReady`).
    <group ref={group} visible={ready}>
      <instancedMesh
        ref={mesh}
        args={[res.geometry, res.material, ASTEROIDS.length]}
        frustumCulled={false}
        raycast={noRaycast}
      />
    </group>
  );
}
