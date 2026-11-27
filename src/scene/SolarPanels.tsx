import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { selectBlackout, useStore } from '../store';
import { LAYOUT } from './layout';
import { PANELS, createPanelLights, relightDelays, stepPanelLights, type PanelLights } from './panels';

/** Board size (x by z), its tilt toward the sun (south, +z) and its height on the post. */
const BOARD = { w: 1, d: 0.6, t: 0.04, tilt: 0.5, y: 0.55 } as const;
const POST = 0.08;

/** Board and post as one geometry: one primitive, one material, one draw call for the whole field. */
function panelGeometry() {
  const board = new BoxGeometry(BOARD.w, BOARD.t, BOARD.d).rotateX(BOARD.tilt).translate(0, BOARD.y, 0);
  const post = new BoxGeometry(POST, BOARD.y, POST).translate(0, BOARD.y / 2, 0);
  return mergeGeometries([board, post]);
}

/**
 * A flat light strip lying on the board's upper edge, in the same panel frame. It faces up, so it is
 * seen from the base side (the board's back) as well as from the south.
 */
function lightGeometry() {
  const edgeY = BOARD.y + (BOARD.d / 2) * Math.sin(BOARD.tilt) + BOARD.t;
  const edgeZ = -(BOARD.d / 2) * Math.cos(BOARD.tilt);
  return new PlaneGeometry(BOARD.w * 0.9, 0.12).rotateX(-Math.PI / 2).translate(0, edgeY, edgeZ);
}

const noRaycast = () => null;

/** One frame of the lights: the colour buffer is uploaded only on the frames it changed. */
function stepLights(mesh: InstancedMesh, state: PanelLights, nowMs: number) {
  if (mesh.instanceColor && stepPanelLights(state, selectBlackout(useStore.getState()), nowMs))
    mesh.instanceColor.needsUpdate = true;
}

/**
 * The solar panel field south of the base (plan 007 A.2): one InstancedMesh for the panels and one
 * for their lights, so two draw calls. Panels only receive shadows; nothing here takes taps. The
 * lights are a basic material coloured per instance; they go dark together in a blackout and come
 * back from the generator outwards, the colour buffer uploaded only while that happens.
 */
export function SolarPanels() {
  const panels = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const res = useMemo(() => {
    const state = createPanelLights(relightDelays(PANELS, LAYOUT.generator));
    const color = new InstancedBufferAttribute(state.colors, 3);
    color.setUsage(DynamicDrawUsage);
    return {
      state,
      color,
      panelGeometry: panelGeometry(),
      lightGeometry: lightGeometry(),
      panelMaterial: new MeshStandardMaterial({ color: '#22324f', metalness: 0.35, roughness: 0.45 }),
      lightMaterial: new MeshBasicMaterial({ toneMapped: false }),
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
    <>
      <instancedMesh
        ref={panels}
        args={[res.panelGeometry, res.panelMaterial, PANELS.length]}
        receiveShadow
        raycast={noRaycast}
      />
      <instancedMesh ref={lights} args={[res.lightGeometry, res.lightMaterial, PANELS.length]} raycast={noRaycast} />
    </>
  );
}
