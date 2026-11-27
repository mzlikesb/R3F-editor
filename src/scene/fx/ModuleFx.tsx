import { useState } from 'react';
import { effectsFor } from '../../feedback';
import { selectAnyFault, selectModuleStatus, selectOthersHolding, useStore } from '../../store';
import type { ModuleFxProps } from '../moduleTypes';
import { Glow } from './Glow';
import { FaultBadge, NameTag } from './Labels';
import { labelPlan } from './labelRules';
import { FloorRing, RingPing, SweepRing } from './Rings';
import { Sparks } from './Sparks';
import { StatusLight } from './StatusLight';
import { useEmissive } from './useEmissive';
import { usePunch } from './usePunch';
import './fx.css';

interface Tokens {
  sweep: number;
  burst: number;
  ping: number;
}

const NO_TOKENS: Tokens = { sweep: 0, burst: 0, ping: 0 };

/**
 * Everything that shows a module's state, drawn inside the module's group (local origin = module
 * ground center): emissive pulse and red→green blend, status light, name tag / fault badge, floor
 * ring, sweep ring, punch, sparks, glow, ring ping (plan 005 B, C, D.11).
 */
export function ModuleFx({ id, handle }: ModuleFxProps) {
  const faulted = useStore((s) => selectModuleStatus(s, id)) === 'fault';
  const selected = useStore((s) => s.selected);
  const anyFault = useStore(selectAnyFault);
  const othersHolding = useStore((s) => selectOthersHolding(s, id)) > 0;
  const effect = useStore((s) => s.feedback.effect);

  // A repair that was already there at mount does not play. Adjusting state while rendering
  // (instead of in an effect) starts the one-shots in the same pass the new `seq` arrives.
  const [seen, setSeen] = useState(effect?.seq ?? null);
  const [tokens, setTokens] = useState<Tokens>(NO_TOKENS);
  if (effect && effect.seq !== seen) {
    setSeen(effect.seq);
    if (effect.moduleId === id) {
      const fx = effectsFor(effect.outcome);
      setTokens({
        sweep: fx.sweep ? effect.seq : 0,
        burst: fx.burst ? effect.seq : 0,
        ping: fx.ringPing ? effect.seq : 0,
      });
    }
  }

  useEmissive(handle, faulted, tokens.sweep);
  usePunch(handle, tokens.burst);

  const height = handle?.height ?? 1;
  const radius = handle?.radius ?? 0.6;
  // TODO(scene): one shared plan for all modules (faults, blackout, holding from the store).
  const plan = labelPlan({ faults: [], selected, blackout: false, holding: [] });
  const label = faulted && anyFault ? 'badge' : plan.tag === id ? 'tag' : null;
  // The model's parent is the module group, the only scaled ancestor (`scene/Module.tsx`).
  const unit = 1 / (handle?.model.parent?.scale.x || 1);

  return (
    <group>
      {handle ? (
        <>
          <FloorRing radius={radius} fault={faulted} />
          {faulted ? null : <StatusLight height={height} />}
          {label === 'badge' ? (
            <FaultBadge id={id} height={height} unit={unit} othersHolding={othersHolding} sensorText="" />
          ) : label === 'tag' ? (
            <NameTag id={id} height={height} unit={unit} />
          ) : null}
          <SweepRing radius={radius} height={height} token={tokens.sweep} />
          <RingPing radius={radius} token={tokens.ping} />
          <Sparks radius={radius} height={height} token={tokens.burst} />
          <Glow radius={radius} height={height} token={tokens.burst} />
        </>
      ) : null}
    </group>
  );
}
