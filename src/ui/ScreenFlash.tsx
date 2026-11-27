import { useState } from 'react';
import { effectsFor } from '../feedback';
import { useStore } from '../store';
import '../scene/fx/fx.css';

/**
 * Full-screen white flash on my repair (plan 005 C.9), a DOM overlay outside the canvas. A repair
 * already there at mount does not flash.
 */
export function ScreenFlash() {
  const effect = useStore((s) => s.feedback.effect);
  const [seen, setSeen] = useState(effect?.seq ?? null);
  const [flashSeq, setFlashSeq] = useState<number | null>(null);

  if (effect && effect.seq !== seen) {
    setSeen(effect.seq);
    if (effectsFor(effect.outcome).burst) setFlashSeq(effect.seq);
  }

  if (flashSeq === null) return null;
  return <div key={flashSeq} className="fx-flash" aria-hidden="true" onAnimationEnd={() => setFlashSeq(null)} />;
}
