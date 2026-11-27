import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry } from 'three';
import { BURST_S, setOpacity, step, useOneShot } from './shared';

const SPARK_GEOMETRY = new SphereGeometry(1, 6, 4);
const GRAVITY = 4.5;
const SPARK_COUNT = 28;
const SPARK_S = BURST_S * 0.9;

function throwSparks(vel: Float32Array, count: number, radius: number): void {
  const speed = Math.max(radius, 0.4) * 2.2;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const up = 0.4 + Math.random() * 0.9;
    const out = 0.5 + Math.random();
    vel[i * 3] = Math.cos(a) * out * speed * 0.5;
    vel[i * 3 + 1] = up * speed;
    vel[i * 3 + 2] = Math.sin(a) * out * speed * 0.5;
  }
}

function drawSparks(
  m: InstancedMesh,
  dummy: Object3D,
  vel: Float32Array,
  count: number,
  t: number,
  scale: number,
  y0: number,
): void {
  for (let i = 0; i < count; i++) {
    dummy.position.set(
      (vel[i * 3] ?? 0) * t,
      y0 + (vel[i * 3 + 1] ?? 0) * t - 0.5 * GRAVITY * t * t,
      (vel[i * 3 + 2] ?? 0) * t,
    );
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
}

interface SparksProps {
  radius: number;
  height: number;
  token: number;
}

/** One InstancedMesh pool (one draw call) of sparks thrown out when my repair lands. */
export function Sparks({ radius, height, token }: SparksProps) {
  const count = useMemo(
    () => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? SPARK_COUNT / 2 : SPARK_COUNT),
    [],
  );
  const mesh = useRef<InstancedMesh>(null);
  const timerRef = useOneShot(token);
  const dummy = useMemo(() => new Object3D(), []);
  const vel = useMemo(() => new Float32Array(count * 3), [count]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffd27a',
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  // Fresh random velocities for each burst.
  useEffect(() => {
    if (token > 0) throwSparks(vel, count, radius);
  }, [token, count, radius, vel]);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const p = step(timerRef, delta, SPARK_S);
    if (p < 0) return;
    if (p >= 1) {
      m.visible = false;
      return;
    }
    m.visible = true;
    drawSparks(m, dummy, vel, count, p * SPARK_S, (0.03 + 0.03 * radius) * (1 - p), height * 0.5);
    setOpacity(material, 1 - p * p);
  });

  return <instancedMesh ref={mesh} args={[SPARK_GEOMETRY, material, count]} frustumCulled={false} visible={false} />;
}
