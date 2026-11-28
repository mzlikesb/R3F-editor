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
  /**
   * Half-size of the invisible margin tap box in model units (before `scale`), a bit larger than the
   * model. Kept tight on the generator: it stands in front of the oxygen tank in the overview, and a
   * taller box there took taps on the tank (playtest #47). `scene/tapPick.ts` picks a model first.
   */
  tapHalf: readonly [number, number, number];
  /** Height of the margin tap box in model units. */
  tapHeight: number;
}

/** Each GLB's bounds in model units (`gltf-transform inspect`): the body tap box and the floor ring footprint. */
export const MODEL_BOUNDS: Record<BaseModuleId, { halfX: number; halfZ: number; height: number }> = {
  generator: { halfX: 0.5, halfZ: 0.65, height: 0.683 },
  oxygen: { halfX: 0.377, halfZ: 0.377, height: 0.6 },
  greenhouse: { halfX: 1.636, halfZ: 1.416, height: 1.4 },
  comms: { halfX: 0.424, halfZ: 0.368, height: 0.814 },
  habitat: { halfX: 1.636, halfZ: 1.416, height: 1.5 },
};

/**
 * Where a module's highest point is horizontally, in model units from its ground center. The status
 * light sits over it. Most tops are flat enough that the center reads right; the comms tower's dish
 * peaks at its back edge, and a light over the center floated off the dish from some angles (#103).
 * Measured from each GLB's highest vertex.
 */
export const TOP_AT: Record<BaseModuleId, { x: number; z: number }> = {
  generator: { x: 0, z: 0 },
  oxygen: { x: 0, z: 0 },
  greenhouse: { x: 0, z: 0 },
  comms: { x: 0, z: 0.368 },
  habitat: { x: 0, z: 0 },
};

const RING = 8.5;
const at = (deg: number) => [Math.sin((deg * Math.PI) / 180) * RING, Math.cos((deg * Math.PI) / 180) * RING] as const;

const oxygen = at(200);
const greenhouse = at(320);
const comms = at(40);
const habitat = at(140);

export const LAYOUT: Record<BaseModuleId, ModuleLayout> = {
  generator: { x: 0, z: 0, scale: 3, rotationY: 0, focusDistance: 7, tapHalf: [0.58, 0.9, 0.72], tapHeight: 0.75 },
  oxygen: {
    x: oxygen[0],
    z: oxygen[1],
    scale: 3.5,
    rotationY: 0,
    focusDistance: 8,
    tapHalf: [0.5, 0.8, 0.5],
    tapHeight: 0.75,
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

/** Pixels the overview keeps free: HUD on top, hint/toast at the bottom. */
export const OVERVIEW_MARGIN = { side: 12, top: 130, bottom: 70 } as const;

/**
 * Bottom UI of the overview on a phone: the hint bar (about 36 px) over the 12 px gutter and the
 * home-indicator safe area (34 px on an iPhone), with a little air. The portrait overview rests the
 * base on this line (plan 008 A.2).
 */
export const OVERVIEW_BOTTOM_UI = 96;

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

/** Room above each module's top for its name tag or fault badge (world units). */
const LABEL_ROOM = 2;
export const LABEL_POINTS = Object.values(LAYOUT).map((l) => ({
  x: l.x,
  y: l.tapHeight * l.scale + LABEL_ROOM,
  z: l.z,
}));

export const BOUNDS = 14;

/**
 * The ground disc is solid out to `GROUND_RADIUS`, then fades into the sky by `GROUND_FADE_RADIUS`.
 * All scenery stays inside the solid part (`scatter` rules, plan 007 A.0).
 */
export const GROUND_RADIUS = 48;
export const GROUND_FADE_RADIUS = 80;

/** Gap (world units) kept between two neighbouring floor rings at full size. */
const RING_GAP = 0.3;

/**
 * The fault floor ring's pulse, in the module's local units: from just outside the model to half the
 * free ground to the nearest neighbour (neon: two broken neighbours' rings crossed). So any two
 * rings at full size stay `RING_GAP` apart.
 */
export function floorRingRange(id: BaseModuleId): { from: number; to: number } {
  const l = LAYOUT[id];
  const footprint = (m: BaseModuleId) => Math.max(MODEL_BOUNDS[m].halfX, MODEL_BOUNDS[m].halfZ) * LAYOUT[m].scale;
  const own = footprint(id);
  let free = Infinity;
  for (const other of Object.keys(LAYOUT) as BaseModuleId[]) {
    if (other === id) continue;
    const d = Math.hypot(l.x - LAYOUT[other].x, l.z - LAYOUT[other].z);
    free = Math.min(free, (d - own - footprint(other) - RING_GAP) / 2);
  }
  return { from: Math.max((own * 1.1) / l.scale, selectRingRadius(id) * 1.15), to: (own + free) / l.scale };
}

/**
 * The selection ring's radius in the module's local units: just outside the tap box (plan 008 B.1).
 * It does not move; the fault ring pulses outside it, so a selected broken module shows both apart.
 */
export function selectRingRadius(id: BaseModuleId): number {
  const { tapHalf } = LAYOUT[id];
  return Math.max(tapHalf[0], tapHalf[2]) * 1.05;
}

/** Eight points round each fault ring at full size: the portrait overview keeps them above the bottom UI. */
export const FLOOR_RING_POINTS = Object.entries(LAYOUT).flatMap(([id, l]) => {
  const r = floorRingRange(id as BaseModuleId).to * l.scale;
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { x: l.x + Math.sin(a) * r, y: 0, z: l.z + Math.cos(a) * r };
  });
});
