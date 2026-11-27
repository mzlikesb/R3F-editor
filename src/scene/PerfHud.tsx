import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { LOOK, LOOK_INFO } from './look';
import { useQuality } from './qualityStore';
import './scene.css';

const INTERVAL = 0.5;

/**
 * FPS, draw calls, triangles, shader programs and the quality stage, written to the DOM twice a
 * second (no React state), plus the forced-low toggle that walks the quality ladder (plan 007 C.11).
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
      // `?look=max`: the composer's last pass resets the counters, so Post.tsx keeps the frame total.
      const { calls, triangles } = LOOK === 'max' ? LOOK_INFO : gl.info.render;
      const programs = gl.info.programs?.length ?? 0;
      const { stage, tier, dpr } = useQuality.getState();
      node.textContent =
        `${Math.round(frames.current / elapsed.current)} fps\n${calls} draws\n${triangles} tris\n` +
        `${programs} programs\nstage ${stage} ${tier}\ndpr ${dpr}`;
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
