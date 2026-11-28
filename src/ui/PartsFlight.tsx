import { useLayoutEffect, useRef } from 'react';
import { useStore } from '../store';

/**
 * My picked-up piece flying from where it was tapped to the HUD's parts chip (009-2 playtest: nobody
 * tied the violet piece to the store). A DOM dot over the canvas, one CSS animation per tap; the
 * chip's own `+1` follows when the server confirms.
 */
export function PartsFlight() {
  const flight = useStore((s) => s.flight);
  const dot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = dot.current;
    const chip = document.querySelector('.hud-parts');
    if (!el || !chip) return;
    const r = chip.getBoundingClientRect();
    el.style.setProperty('--fly-dx', `${r.left + r.width / 2 - flight.x}px`);
    el.style.setProperty('--fly-dy', `${r.top + r.height / 2 - flight.y}px`);
  }, [flight]);
  if (flight.seq === 0) return null;
  return <div key={flight.seq} ref={dot} className="parts-flight" style={{ left: flight.x, top: flight.y }} />;
}
