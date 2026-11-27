import { useState } from 'react';
import { effectsFor } from '../../feedback';
import { selectBlackout, selectModuleFault, selectOthersHolding, selectReady, useStore } from '../../store';
import { floorRingRange } from '../layout';
import type { ModuleFxProps } from '../moduleTypes';
import { Glow } from './Glow';
import { FaultBadge, FaultDot, NameTag } from './Labels';
import { useLabelPlan } from './labelPlanContext';
import { FloorRing, HoldingRing, RingPing, SweepRing } from './Rings';
import { Sparks } from './Sparks';
import { StatusLight } from './StatusLight';
import { useEmissive } from './useEmissive';
import { usePunch } from './usePunch';
import './fx.css';

interface Tokens {
  sweep: number;
  burst: number;
  /** The burst is a helper's (#56): smaller punch, half the sparks, no glow. */
  soft: boolean;
  ping: number;
  afterglow: number;
}

const NO_TOKENS: Tokens = { sweep: 0, burst: 0, soft: false, ping: 0, afterglow: 0 };

/**
 * Everything that shows a module's state, drawn inside the module's group (local origin = module
 * ground center): emissive pulse and red→green blend, status light, name tag / fault badge, floor
 * ring, sweep ring, punch, sparks, glow, ring ping (plan 005 B, C, D.11), and the afterglow of
 * someone else's repair. The status light waits for the base: green before the first snapshot
 * would claim a healthy base (playtest #47).
 */
export function ModuleFx({ id, handle }: ModuleFxProps) {
  const fault = useStore((s) => selectModuleFault(s, id));
  const faulted = fault !== null;
  const blackout = useStore(selectBlackout);
  const plan = useLabelPlan();
  const othersHolding = useStore((s) => selectOthersHolding(s, id)) > 0;
  const effect = useStore((s) => s.feedback.effect);
  const ready = useStore(selectReady);

  // A repair that was already there at mount does not play. Adjusting state while rendering
  // (instead of in an effect) starts the one-shots in the same pass the new `seq` arrives.
  const [seen, setSeen] = useState(effect?.seq ?? null);
  const [tokens, setTokens] = useState<Tokens>(NO_TOKENS);
  if (effect && effect.seq !== seen) {
    setSeen(effect.seq);
    if (effect.moduleId === id) {
      // Repair effects play only on the module that was repaired.
      const fx = effectsFor(effect.outcome);
      setTokens({
        sweep: fx.sweep ? effect.seq : 0,
        burst: fx.burst ? effect.seq : 0,
        soft: fx.soft,
        ping: fx.ringPing ? effect.seq : 0,
        afterglow: fx.afterglow ? effect.seq : 0,
      });
    }
  }

  useEmissive(handle, faulted, tokens.sweep, id, blackout, tokens.afterglow);
  usePunch(handle, tokens.burst, tokens.soft);

  const height = handle?.height ?? 1;
  const radius = handle?.radius ?? 0.6;
  const label = plan.badge === id ? 'badge' : plan.dots.includes(id) ? 'dot' : plan.tag === id ? 'tag' : null;
  // The model's parent is the module group, the only scaled ancestor (`scene/Module.tsx`).
  const unit = 1 / (handle?.model.parent?.scale.x || 1);

  return (
    <group>
      {handle ? (
        <>
          <FloorRing range={floorRingRange(id)} fault={faulted} />
          {faulted || !ready ? null : <StatusLight height={height} />}
          {othersHolding ? <HoldingRing height={height} radius={radius} /> : null}
          {label === 'badge' && fault ? (
            <FaultBadge id={id} fault={fault} height={height} unit={unit} othersHolding={othersHolding} />
          ) : label === 'dot' ? (
            <FaultDot id={id} height={height} unit={unit} />
          ) : label === 'tag' ? (
            <NameTag id={id} height={height} unit={unit} />
          ) : null}
          <SweepRing radius={radius} height={height} token={tokens.sweep} />
          <RingPing radius={radius} token={tokens.ping} />
          <Sparks radius={radius} height={height} token={tokens.burst} soft={tokens.soft} />
          <Glow radius={radius} height={height} token={tokens.soft ? 0 : tokens.burst} />
        </>
      ) : null}
    </group>
  );
}
