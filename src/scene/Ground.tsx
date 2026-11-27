const RADIUS = 70;

/** The planet surface: one big disc. It ignores raycasts so tapping it counts as tapping empty space. */
export function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
      <circleGeometry args={[RADIUS, 48]} />
      <meshStandardMaterial color="#5a4f47" roughness={1} metalness={0} />
    </mesh>
  );
}
