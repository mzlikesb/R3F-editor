import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { POST_INFO } from './perf';
import { useQuality } from './qualityStore';
import './scene.css';

const INTERVAL = 0.5;
const POST_NAMES = ['full', 'no-ao', 'no-bloom', 'off'];

/**
 * FPS, draw calls (scene and post-processing apart), triangles, shader programs, the quality stage
 * and the post-processing step, written to the DOM twice a second (no React state), plus the
 * forced-low toggle that walks the quality ladder (plan 007 C.11).
 */
export function PerfHud() {
  const el = useRef<HTMLDivElement>(null);
  const frames = useRef(0);
  const elapsed = useRef(0);
  const forceLow = useQuality((s) => s.forceLow);

  useFrame(({ gl }, delta) => {
    frames.current += 1;
    elapsed.current += delta;
    if (elapsed.current < INTERVAL) return;
    const node = el.current;
    if (node) {
      // Under the composer the scene's own draws (read right after the render pass, R6) and the
      // post-processing passes' are apart; the budget (100) is for the scene.
      const draws = POST_INFO.on
        ? `${POST_INFO.scene} draws\n+${POST_INFO.total - POST_INFO.scene} post\n${POST_INFO.sceneTriangles} tris`
        : `${gl.info.render.calls} draws\n${gl.info.render.triangles} tris`;
      const programs = gl.info.programs?.length ?? 0;
      const { stage, tier, dpr, post } = useQuality.getState();
      node.textContent =
        `${Math.round(frames.current / elapsed.current)} fps\n${draws}\n` +
        `${programs} programs\nstage ${stage} ${tier}\npost ${POST_NAMES[post] ?? post}\ndpr ${dpr}`;
    }
    frames.current = 0;
    elapsed.current = 0;
  });

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div className="perf-hud">
        <div ref={el} className="perf-hud-text" />
        <button
          type="button"
          className="perf-hud-toggle"
          aria-pressed={forceLow}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            useQuality.getState().setForceLow(!forceLow);
          }}
        >
          {forceLow ? 'forced low: on' : 'forced low: off'}
        </button>
      </div>
    </Html>
  );
}
