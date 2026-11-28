import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DodecahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SpriteMaterial,
  type Sprite,
  type Group,
} from 'three';
import { PART_Y, partSlot, partSpot } from '../../shared/parts';
import { blinkOn, pieceShown } from '../parts';
import { useStore } from '../store';
import { serverNow } from '../sync';
import { RingPing } from './fx/Rings';
import { registerFx } from './fx/fxGain';
import { PALETTE } from './palette';
import { haloTexture } from './haloTexture';

/**
 * A low-poly metal scrap: facets catch the light as it turns, unlike the round rocks. About 1.5x
 * the first cut (0.3), which read on a phone as one more pebble (009-2 QA).
 */
const GEOMETRY = new DodecahedronGeometry(0.45, 0);
/**
 * Half-size 0.6 (`partSpots.test.ts` `PART_TAP_HALF`, what the R1 spots keep clear of the modules):
 * still wider than the piece (0.9 across), so the finger gets a margin round it.
 */
const TAP_GEOMETRY = new BoxGeometry(1.2, 1.2, 1.2);
/** The soft glow round the piece, world units across, and how strong (additive, under the Bloom threshold). */
const HALO_SIZE = 2.2;
const HALO_OPACITY = 0.55;
const TAP_MATERIAL = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const PART_COLOR = new Color(PALETTE.part);
/** The ping ring round a piece starts this wide (world units). */
const PING_RADIUS = 0.6;

const SPIN = 1.1;
const BOB = 0.08;
/** A new piece falls from this high, for this long (s). */
const DROP_HEIGHT = 3;
const DROP_S = 0.45;
/** Picked up: it rises and shrinks away towards the HUD, for this long (s). */
const SUCK_S = 0.35;
const SUCK_RISE = 2.5;

const noRaycast = () => {};
const meshRaycast = Mesh.prototype.raycast;

function onTap(e: ThreeEvent<MouseEvent>) {
  e.stopPropagation();
  useStore.getState().collectPiece(performance.now(), Date.now());
}

/**
 * The parts piece of the current slot (plan 009 B.1, B.2): one emissive metal mesh, so it is seen in
 * a blackout too, plus an invisible finger box that takes taps only while the piece is out. Where
 * and whether it shows comes from server time each frame (`pieceShown`); nothing is allocated per
 * frame. Its ring ping (B.4) is a `RingPing` in the part violet, drawn only while it plays.
 */
export function PartPiece() {
  const group = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const tap = useRef<Mesh>(null);
  const anim = useRef({ slot: -1, dropAt: -1, suckAt: -1, shown: false });
  const halo = useRef<Sprite>(null);
  const haloMaterial = useMemo(
    () =>
      new SpriteMaterial({
        map: haloTexture(),
        color: PART_COLOR,
        transparent: true,
        opacity: HALO_OPACITY,
        depthWrite: false,
        // The ground would cut the lower half of the glow off; spots are never behind a module (R1).
        depthTest: false,
        blending: AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    [],
  );
  useEffect(() => {
    const unregister = registerFx(haloMaterial, 'tone');
    return () => {
      unregister();
      haloMaterial.map?.dispose();
      haloMaterial.dispose();
    };
  }, [haloMaterial]);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#9aa0ab',
        metalness: 0.85,
        roughness: 0.3,
        emissive: PART_COLOR,
        emissiveIntensity: 0.9,
        flatShading: true,
      }),
    [],
  );
  // Under the composer the glow takes the colour that comes out of tone mapping as the part violet.
  useEffect(() => {
    const unregister = registerFx({ color: material.emissive }, 'tone');
    return () => {
      unregister();
      material.dispose();
    };
  }, [material]);

  const ping = useStore((s) => s.partPing);
  const [pingX, pingZ] = ping.seq > 0 ? partSpot(ping.slot) : [0, 0];

  useFrame(({ clock }, delta) => {
    const g = group.current;
    const b = body.current;
    const t = tap.current;
    if (!g || !b || !t) return;
    const { sync, pickup } = useStore.getState();
    const now = serverNow(sync, Date.now());
    const slot = partSlot(now);
    const time = clock.elapsedTime;
    const a = anim.current;
    if (slot !== a.slot) {
      a.slot = slot;
      a.dropAt = time;
      a.suckAt = -1;
    }
    const shown = pieceShown(sync.base, slot, pickup);
    const mine = pickup.kind === 'pending' && pickup.slot === slot;
    if (a.shown && !shown && mine) a.suckAt = time;
    if (shown) a.suckAt = -1;
    a.shown = shown;
    t.raycast = shown ? meshRaycast : noRaycast;

    const sucking = a.suckAt >= 0 && time - a.suckAt < SUCK_S;
    if (!shown && !sucking) {
      g.visible = false;
      return;
    }
    const [x, z] = partSpot(slot);
    const drop = Math.min(1, (time - a.dropAt) / DROP_S);
    let y = PART_Y + BOB * Math.sin(time * 2.2) + DROP_HEIGHT * (1 - drop) * (1 - drop);
    let scale = 1;
    if (sucking) {
      const p = (time - a.suckAt) / SUCK_S;
      y += SUCK_RISE * p * p;
      scale = 1 - p;
    }
    g.visible = true;
    g.position.set(x, y, z);
    b.visible = sucking || blinkOn(now);
    b.scale.setScalar(scale);
    const h = halo.current;
    if (h) {
      h.visible = b.visible;
      h.scale.setScalar(HALO_SIZE * scale);
    }
    b.rotation.y += delta * SPIN;
    b.rotation.x = 0.5 + 0.2 * Math.sin(time * 0.7);
  });

  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={body} geometry={GEOMETRY} material={material} raycast={noRaycast} />
        <sprite ref={halo} material={haloMaterial} scale={HALO_SIZE} raycast={noRaycast} />
        <mesh ref={tap} geometry={TAP_GEOMETRY} material={TAP_MATERIAL} visible={false} onClick={onTap} />
      </group>
      <group position={[pingX, 0, pingZ]}>
        <RingPing radius={PING_RADIUS} token={ping.seq} color={PART_COLOR} />
      </group>
    </>
  );
}
