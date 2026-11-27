import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import './scene.css';

const INTERVAL = 0.5;

/** FPS, draw calls and triangles of the last frame, written to the DOM twice a second (no React state). */
export function PerfHud() {
  const el = useRef<HTMLDivElement>(null);
  const frames = useRef(0);
  const elapsed = useRef(0);

  useFrame(({ gl }, delta) => {
    frames.current += 1;
    elapsed.current += delta;
    if (elapsed.current < INTERVAL) return;
    const node = el.current;
    if (node) {
      const { calls, triangles } = gl.info.render;
      node.textContent = `${Math.round(frames.current / elapsed.current)} fps\n${calls} draws\n${triangles} tris`;
    }
    frames.current = 0;
    elapsed.current = 0;
  });

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div ref={el} className="perf-hud" />
    </Html>
  );
}
