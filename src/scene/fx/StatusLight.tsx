import { MeshBasicMaterial, SphereGeometry } from 'three';

const LIGHT_GEOMETRY = new SphereGeometry(0.06, 10, 8);
const LIGHT_MATERIAL = new MeshBasicMaterial({ color: '#4ade80', toneMapped: false });

/** The small green dot of a healthy module, a little above its top. */
export function StatusLight({ height }: { height: number }) {
  return <mesh geometry={LIGHT_GEOMETRY} material={LIGHT_MATERIAL} position-y={height + 0.12} />;
}
