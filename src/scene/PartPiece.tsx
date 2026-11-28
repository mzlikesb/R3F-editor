import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Group,
} from 'three';
import { PART_Y, partSlot, partSpot } from '../../shared/parts';
import { blinkOn, pieceShown, vanishReason } from '../parts';
import { selectReady, useStore } from '../store';
import { serverNow } from '../sync';
import { RingPing } from './fx/Rings';
import { registerFx } from './fx/fxGain';
import { LABEL_WRAPPER_STYLE } from './fx/labelRules';
import { PALETTE } from './palette';
import { pieceTrack, onSceneTap } from './sceneTap';
import type { PieceHit } from './tapPick';

/**
 * A hex nut lying on the ground: a squat, angular metal block, not the drones' floating octahedron
 * (neon on #114: the two read as one thing). Flat-shaded, so the facets catch the light as it turns.
 */
const NUT_RADIUS = 0.42;
const NUT_HEIGHT = 0.26;
const GEOMETRY = new CylinderGeometry(NUT_RADIUS, NUT_RADIUS, NUT_HEIGHT, 6);
/** Resting height of the nut's centre: on the ground. */
const REST_Y = NUT_HEIGHT / 2 + 0.02;
/**
 * The finger box, half-size 0.6 (`partSpots.test.ts` `PART_TAP_HALF`, what the R1 spots keep clear
 * of the modules), centred at `PART_Y`: wider than the nut, so the finger gets a margin round it.
 */
const TAP_GEOMETRY = new BoxGeometry(1.2, 1.2, 1.2);
const TAP_MATERIAL = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
/** The ground mark: a dark contact shadow with a thin violet ring round it, world units across. */
const MARK_SIZE = 1.7;
const MARK_GEOMETRY = new PlaneGeometry(1, 1);
const PART_COLOR = new Color(PALETTE.part);
/** The ping ring round a piece starts this wide (world units). */
const PING_RADIUS = 0.6;

const SPIN = 0.6;
/** Barely off the ground: a thing lying there, not hovering. */
const BOB = 0.02;
/** A new piece falls from this high, for this long (s). */
const DROP_HEIGHT = 3;
const DROP_S = 0.45;
/** Picked up: it rises and shrinks away towards the HUD, for this long (s). */
const SUCK_S = 0.35;
const SUCK_RISE = 2.5;
/** World units from the ground up to the bottom edge of the `부품` tag. */
const TAG_LIFT = 0.75;
/** About half the tag's height in world units at the overview distance (for `pieceTrack`). */
const TAG_CENTRE = 0.3;

const noRaycast = () => {};
const HIDDEN = { visibility: 'hidden' } as const;
const meshRaycast = Mesh.prototype.raycast;

/** What the piece's finger box says to the module tap handler (`tapPick.ts`). */
const PIECE_HIT: PieceHit = { piece: true };

/** The name tag `부품` over the piece takes taps like the piece. */
function onTagTap(e: MouseEvent) {
  e.stopPropagation();
  useStore.getState().collectPiece(performance.now(), Date.now(), { x: e.clientX, y: e.clientY });
}

/** Dark soft centre (contact shadow) and a thin bright ring at the edge, white so the material colours it. */
function markTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const shadow = ctx.createRadialGradient(64, 64, 0, 64, 64, 46);
  shadow.addColorStop(0, 'rgba(0,0,0,0.55)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.stroke();
  return new CanvasTexture(canvas);
}

/**
 * The parts piece of the current slot (plan 009 B.1, B.2): a glowing metal nut on the ground (seen in
 * a blackout too) with a ground mark, a `부품` name tag, and an invisible finger box that takes taps
 * only while the piece is out. Where and whether it shows comes from server time each frame
 * (`pieceShown`), and nothing shows before the scene is in (`selectReady`). Nothing is allocated
 * per frame. Its ring ping (B.4) is a `RingPing` in the part violet, drawn only while it plays.
 */
export function PartPiece() {
  const group = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const mark = useRef<Mesh>(null);
  const tap = useRef<Mesh>(null);
  const tag = useRef<HTMLDivElement>(null);
  const tagShown = useRef(false);
  const anim = useRef({ slot: -1, dropAt: -1, suckAt: -1, shown: false });
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#9aa0ab',
        metalness: 0.85,
        roughness: 0.3,
        emissive: PART_COLOR,
        emissiveIntensity: 0.7,
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
  // Normal blending: the shadow darkens the ground, the ring shows the part violet unlit.
  const markMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        map: markTexture(),
        color: PART_COLOR,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    [],
  );
  useEffect(() => {
    const unregister = registerFx(markMaterial, 'tone');
    return () => {
      unregister();
      markMaterial.map?.dispose();
      markMaterial.dispose();
    };
  }, [markMaterial]);

  const ping = useStore((s) => s.partPing);
  const [pingX, pingZ] = ping.seq > 0 ? partSpot(ping.slot) : [0, 0];

  useFrame(({ clock, camera }, delta) => {
    const g = group.current;
    const b = body.current;
    const m = mark.current;
    const t = tap.current;
    if (!g || !b || !m || !t) return;
    const state = useStore.getState();
    const { sync, pickup } = state;
    const now = serverNow(sync, Date.now());
    const slot = partSlot(now);
    const time = clock.elapsedTime;
    const a = anim.current;
    if (slot !== a.slot) {
      a.slot = slot;
      a.dropAt = time;
      a.suckAt = -1;
    }
    // Nothing before the modules are on screen (neon on #114).
    const shown = selectReady(state) && pieceShown(sync.base, slot, pickup);
    const mine = pickup.kind === 'pending' && pickup.slot === slot;
    if (a.shown && !shown && mine) a.suckAt = time;
    if (shown) a.suckAt = -1;
    if (pieceTrack.live && !shown) {
      pieceTrack.goneAt = performance.now();
      pieceTrack.goneBy = vanishReason(pickup, pieceTrack.slot, sync.base);
    }
    pieceTrack.live = shown;
    pieceTrack.camera = camera;
    a.shown = shown;
    t.raycast = shown ? meshRaycast : noRaycast;
    // The tag goes with the piece; written to the DOM only when that changes.
    if (tag.current && shown !== tagShown.current) {
      tagShown.current = shown;
      tag.current.style.visibility = shown ? 'visible' : 'hidden';
    }

    const sucking = a.suckAt >= 0 && time - a.suckAt < SUCK_S;
    if (!shown && !sucking) {
      g.visible = false;
      return;
    }
    const [x, z] = partSpot(slot);
    const drop = Math.min(1, (time - a.dropAt) / DROP_S);
    let y = REST_Y + BOB * Math.sin(time * 2.2) + DROP_HEIGHT * (1 - drop) * (1 - drop);
    let scale = 1;
    if (sucking) {
      const p = (time - a.suckAt) / SUCK_S;
      y += SUCK_RISE * p * p;
      scale = 1 - p;
    }
    g.visible = true;
    g.position.set(x, 0, z);
    pieceTrack.x = x;
    pieceTrack.y = REST_Y;
    pieceTrack.tagY = TAG_LIFT + TAG_CENTRE;
    if (shown) pieceTrack.slot = slot;
    pieceTrack.z = z;
    b.position.y = y;
    b.visible = sucking || blinkOn(now);
    b.scale.setScalar(scale);
    b.rotation.y += delta * SPIN;
    // The mark stays on the ground; it is there once the piece has landed.
    m.visible = b.visible && !sucking && drop >= 1;
  });

  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={body} geometry={GEOMETRY} material={material} raycast={noRaycast} />
        <mesh
          ref={mark}
          geometry={MARK_GEOMETRY}
          material={markMaterial}
          rotation-x={-Math.PI / 2}
          position-y={0.03}
          scale={MARK_SIZE}
          raycast={noRaycast}
        />
        <mesh
          ref={tap}
          geometry={TAP_GEOMETRY}
          material={TAP_MATERIAL}
          visible={false}
          position-y={PART_Y}
          userData={PIECE_HIT}
          onClick={onSceneTap}
        />
        <Html position={[0, TAG_LIFT, 0]} style={LABEL_WRAPPER_STYLE} zIndexRange={[0, 0]}>
          <div ref={tag} className="fx-anchor fx-part-anchor" style={HIDDEN}>
            <button type="button" className="fx-tag fx-part-tag" onClick={onTagTap}>
              부품
            </button>
          </div>
        </Html>
      </group>
      <group position={[pingX, 0, pingZ]}>
        <RingPing radius={PING_RADIUS} token={ping.seq} color={PART_COLOR} />
      </group>
    </>
  );
}
