import type { ThreeEvent } from '@react-three/fiber';
import { Vector3, type Camera } from 'three';
import { useStore } from '../store';
import { tapTarget, type PieceHit, type PieceOnScreen, type TapHit } from './tapPick';

/**
 * Where the parts piece is, written by `PartPiece` every frame (no allocation) and read by taps.
 * `goneAt` is `performance.now()` when it last stopped being out; `camera` is the one it was drawn with.
 */
export const pieceTrack: {
  x: number;
  y: number;
  z: number;
  /** Height of the `부품` tag's centre. */
  tagY: number;
  /** The slot of the piece last drawn, and why it went (`vanishReason`). */
  slot: number;
  goneBy: 'mine' | 'other' | 'slot';
  live: boolean;
  goneAt: number;
  camera: Camera | null;
} = { x: 0, y: 0, z: 0, tagY: 0, slot: -1, goneBy: 'slot', live: false, goneAt: -Infinity, camera: null };

const v = new Vector3();

/** The piece against a tap at (`clientX`, `clientY`) on `el`, or null when there has been no piece. */
export function pieceOnScreen(clientX: number, clientY: number, el: Element, now: number): PieceOnScreen | null {
  const camera = pieceTrack.camera;
  if (!camera || (!pieceTrack.live && pieceTrack.goneAt === -Infinity)) return null;
  const r = el.getBoundingClientRect();
  // The nut and its `부품` tag above it both count as the piece.
  const dist = (y: number) => {
    v.set(pieceTrack.x, y, pieceTrack.z).project(camera);
    return Math.hypot(r.left + ((v.x + 1) / 2) * r.width - clientX, r.top + ((1 - v.y) / 2) * r.height - clientY);
  };
  return {
    live: pieceTrack.live,
    distPx: Math.min(dist(pieceTrack.y), dist(pieceTrack.tagY)),
    goneMsAgo: now - pieceTrack.goneAt,
  };
}

/** Acts on what a tap means (`tapTarget`): pick the piece up, ping the next one, or select a module. */
export function actOnTap(target: ReturnType<typeof tapTarget>, clientX: number, clientY: number): void {
  const store = useStore.getState();
  if (target === 'piece') store.collectPiece(performance.now(), Date.now(), { x: clientX, y: clientY });
  else if (target === 'gone') {
    // Someone else's pick-up says so; a slot that ended or my own pick-up stays quiet.
    if (pieceTrack.goneBy === 'other') store.pieceTaken(performance.now());
    store.pingNextPiece(Date.now());
  } else if (target) store.select(target);
}

/**
 * The click handler of every tap box (modules and the piece). Picks from everything under the
 * pointer (`e.intersections`, nearest first), not just the box that was hit first, and from where
 * the piece is on screen (`scene/tapPick.ts`).
 */
export function onSceneTap(e: ThreeEvent<MouseEvent>): void {
  e.stopPropagation();
  const hits = e.intersections
    .map((i) => i.object.userData as Partial<TapHit & PieceHit>)
    .filter((d): d is TapHit | PieceHit => d.piece === true || (d.moduleId !== undefined && d.part !== undefined));
  const { clientX, clientY } = e.nativeEvent;
  const el = e.nativeEvent.target instanceof Element ? e.nativeEvent.target : null;
  const piece = el ? pieceOnScreen(clientX, clientY, el, performance.now()) : null;
  actOnTap(tapTarget(hits, piece), clientX, clientY);
}
