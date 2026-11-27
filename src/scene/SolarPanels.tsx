import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  type InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { selectBlackout, selectReady, useStore } from '../store';
import { LAYOUT } from './layout';
import { LOOK } from './look';
import { PANELS, createPanelLights, relightDelays, stepPanelLights, type PanelLights } from './panels';

/**
 * A wide, low board tilted 30 degrees toward +z (the default overview camera), so its face reads
 * from above. Footprint stays inside `PANEL_RULE.radius` (half diagonal 1.24).
 */
const BOARD = { w: 2.2, d: 1.3, t: 0.06, tilt: Math.PI / 6, y: 0.45, rim: 0.09 } as const;
const POST = 0.1;
// `?look=budget|max`: quieter field (less saturation and brightness, softer frame contrast).
const QUIET = LOOK !== 'none';
const FRAME_COLOR = new Color(QUIET ? '#79818c' : '#c9d2de');
const FACE_COLOR = new Color(QUIET ? '#1a2335' : '#16264a');
const POST_COLOR = new Color(QUIET ? '#5a5f68' : '#7d838d');

/** One solid colour per vertex, so frame, face and post share one material. */
function paint<T extends BufferGeometry>(g: T, c: Color): T {
  const n = g.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  return g;
}

/** Built flat around the board centre, then tilted and lifted onto the post. */
const onPost = <T extends BufferGeometry>(g: T) => g.rotateX(BOARD.tilt).translate(0, BOARD.y, 0);

/**
 * Light frame, dark face inset on top, short post: one geometry with vertex colours, one material,
 * one draw call for the whole field.
 */
function panelGeometry() {
  const frame = paint(onPost(new BoxGeometry(BOARD.w, BOARD.t, BOARD.d)), FRAME_COLOR);
  const face = paint(
    onPost(new BoxGeometry(BOARD.w - BOARD.rim * 2, 0.02, BOARD.d - BOARD.rim * 2).translate(0, BOARD.t / 2, 0)),
    FACE_COLOR,
  );
  const post = paint(new BoxGeometry(POST, BOARD.y, POST).translate(0, BOARD.y / 2, 0), POST_COLOR);
  return mergeGeometries([frame, face, post]);
}

/** A light strip on the face along its upper (far, -z) edge. */
function lightGeometry() {
  const inner = BOARD.d / 2 - BOARD.rim;
  return onPost(
    new PlaneGeometry(BOARD.w - BOARD.rim * 4, 0.12)
      .rotateX(-Math.PI / 2)
      .translate(0, BOARD.t / 2 + 0.02, -inner + 0.1),
  );
}

const noRaycast = () => null;

/** One frame of the lights: the colour buffer is uploaded only on the frames it changed. */
function stepLights(mesh: InstancedMesh, state: PanelLights, nowMs: number) {
  if (mesh.instanceColor && stepPanelLights(state, selectBlackout(useStore.getState()), nowMs))
    mesh.instanceColor.needsUpdate = true;
}

/**
 * The solar panel field north of the base (plan 007 A.2): one InstancedMesh for the panels and one
 * for their lights, so two draw calls. Panels neither cast nor receive shadows (they lie outside the
 * shadow camera); nothing here takes taps. The lights are a basic material coloured per instance;
 * they go dark together in a blackout and come back from the generator outwards, the colour buffer
 * uploaded only while that happens.
 */
export function SolarPanels() {
  const panels = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const ready = useStore(selectReady);
  const res = useMemo(() => {
    const state = createPanelLights(relightDelays(PANELS, LAYOUT.generator));
    const color = new InstancedBufferAttribute(state.colors, 3);
    color.setUsage(DynamicDrawUsage);
    return {
      state,
      color,
      panelGeometry: panelGeometry(),
      lightGeometry: lightGeometry(),
      panelMaterial: new MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.5 }),
      lightMaterial: new MeshBasicMaterial({ toneMapped: false, fog: false }),
    };
  }, []);

  useLayoutEffect(() => {
    const p = panels.current;
    const l = lights.current;
    if (!p || !l) return;
    const o = new Object3D();
    PANELS.forEach((panel, i) => {
      o.position.set(panel.x, 0, panel.z);
      o.rotation.set(0, panel.rotationY, 0);
      o.scale.setScalar(panel.scale);
      o.updateMatrix();
      p.setMatrixAt(i, o.matrix);
      l.setMatrixAt(i, o.matrix);
    });
    l.instanceColor = res.color;
    for (const m of [p, l]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere(); // setMatrixAt alone leaves the bounds of one panel at the origin
    }
  }, [res]);

  useFrame(({ clock }) => {
    const l = lights.current;
    if (l) stepLights(l, res.state, clock.elapsedTime * 1000);
  });

  return (
    // Hidden with the rest of the loading state (`selectReady`), so the field never shows alone.
    <group visible={ready}>
      <instancedMesh ref={panels} args={[res.panelGeometry, res.panelMaterial, PANELS.length]} raycast={noRaycast} />
      <instancedMesh ref={lights} args={[res.lightGeometry, res.lightMaterial, PANELS.length]} raycast={noRaycast} />
    </group>
  );
}
