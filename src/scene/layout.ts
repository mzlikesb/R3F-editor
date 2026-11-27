import type { BaseModuleId } from '../modules';

/** Where a module stands and how it is framed when selected. The generator is small, so it is scaled up. */
export interface ModuleLayout {
  /** Ground position (x, z). */
  x: number;
  z: number;
  scale: number;
  rotationY: number;
  /** Camera distance (horizontal) when this module is focused. */
  focusDistance: number;
  /** Half-size of the invisible tap box in model units (before `scale`), a bit larger than the model. */
  tapHalf: readonly [number, number, number];
  /** Height of the tap box in model units. */
  tapHeight: number;
}

const RING = 8.5;
const at = (deg: number) => [Math.sin((deg * Math.PI) / 180) * RING, Math.cos((deg * Math.PI) / 180) * RING] as const;

const oxygen = at(200);
const greenhouse = at(320);
const comms = at(40);
const habitat = at(140);

export const LAYOUT: Record<BaseModuleId, ModuleLayout> = {
  generator: { x: 0, z: 0, scale: 3, rotationY: 0, focusDistance: 7, tapHalf: [0.7, 0.9, 0.85], tapHeight: 1 },
  oxygen: {
    x: oxygen[0],
    z: oxygen[1],
    scale: 3.5,
    rotationY: 0,
    focusDistance: 8,
    tapHalf: [0.55, 0.8, 0.55],
    tapHeight: 1,
  },
  greenhouse: {
    x: greenhouse[0],
    z: greenhouse[1],
    scale: 1.5,
    rotationY: 0.4,
    focusDistance: 11,
    tapHalf: [1.8, 1.5, 1.6],
    tapHeight: 1.6,
  },
  comms: {
    x: comms[0],
    z: comms[1],
    scale: 3,
    rotationY: 0,
    focusDistance: 8,
    tapHalf: [0.65, 1, 0.6],
    tapHeight: 1.1,
  },
  habitat: {
    x: habitat[0],
    z: habitat[1],
    scale: 1.5,
    rotationY: -0.5,
    focusDistance: 11,
    tapHalf: [1.8, 1.6, 1.6],
    tapHeight: 1.7,
  },
};

/** Scenery GLBs scattered outside the ring. They never take taps. */
export interface Prop {
  model: 'rock-a' | 'rock-b' | 'rocks-small' | 'crater';
  x: number;
  z: number;
  scale: number;
  rotationY: number;
}

export const PROPS: readonly Prop[] = [
  { model: 'rock-a', x: -15, z: -4, scale: 3.2, rotationY: 0.3 },
  { model: 'rock-b', x: 14, z: -9, scale: 3.6, rotationY: 2.1 },
  { model: 'rock-a', x: 4, z: -16, scale: 2.6, rotationY: 4.0 },
  { model: 'rock-b', x: -9, z: 15, scale: 2.8, rotationY: 1.2 },
  { model: 'rock-a', x: 17, z: 8, scale: 3, rotationY: 5.2 },
  { model: 'rocks-small', x: -6, z: -13, scale: 2.4, rotationY: 0.9 },
  { model: 'rocks-small', x: 11, z: 14, scale: 2.2, rotationY: 3.3 },
  { model: 'rocks-small', x: -14, z: 8, scale: 2, rotationY: 2.6 },
  { model: 'crater', x: 14, z: -1, scale: 9, rotationY: 0.2 },
  { model: 'crater', x: -12, z: -11, scale: 7, rotationY: 1.4 },
];

/** The overview looks at this point from this direction; the distance comes from `framing.fitDistance`. */
export const OVERVIEW_TARGET = { x: 0, y: 0.5, z: 0 } as const;
export const OVERVIEW_DIR = { x: 0, y: 12.5, z: 19 } as const;
/** Camera position before the first fit (the desktop overview). */
export const OVERVIEW_START = [0, 13, 19] as const;

/** Each module's footprint corners and top (tap box, so a little generous) in world units: what the overview must show. */
export const OVERVIEW_POINTS = Object.values(LAYOUT).flatMap((l) => {
  const rx = l.tapHalf[0] * l.scale;
  const rz = l.tapHalf[2] * l.scale;
  const top = l.tapHeight * l.scale;
  return [
    { x: l.x - rx, y: 0, z: l.z },
    { x: l.x + rx, y: 0, z: l.z },
    { x: l.x, y: 0, z: l.z - rz },
    { x: l.x, y: 0, z: l.z + rz },
    { x: l.x, y: top, z: l.z },
  ];
});

export const BOUNDS = 14;
