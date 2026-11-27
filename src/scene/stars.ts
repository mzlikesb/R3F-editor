const STARS = 90;
/**
 * Beyond the asteroid belt's bounding sphere (about 149), so from any allowed camera every star lies
 * behind the belt and never shows in front of or inside it; inside the camera's far plane (400).
 * Star size does not depend on distance (`sizeAttenuation` off).
 */
export const STAR_RADIUS = 250;

/** A few fixed stars on the upper hemisphere (x, y, z flat). Deterministic so every client sees the same sky. */
export function starPositions(): number[] {
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
      Math.cos(theta) * Math.cos(phi) * STAR_RADIUS,
      Math.sin(phi) * STAR_RADIUS,
      Math.sin(theta) * Math.cos(phi) * STAR_RADIUS,
    );
  }
  return out;
}
