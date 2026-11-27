import { useState } from 'react';
import { effectsFor } from '../../feedback';
import { isRepairable } from '../../modules';
import { selectModuleStatus, useStore } from '../../store';
import type { ModuleFxProps } from '../moduleTypes';
import { Glow } from './Glow';
import { FaultBadge, NameTag } from './Labels';
import { labelKind } from './labelRules';
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
  const faultedModule = useStore((s) => s.sync.base?.fault?.moduleId ?? null);
  const effect = useStore((s) => s.feedback.effect);

  // A repair that was already there at mount does not play. Adjusting state while rendering
  // (instead of in an effect) starts the one-shots in the same pass the new `seq` arrives.
  const [seen, setSeen] = useState(effect?.seq ?? null);
  const [tokens, setTokens] = useState<Tokens>(NO_TOKENS);
  if (effect && effect.seq !== seen) {
    setSeen(effect.seq);
    if (isRepairable(id)) {
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
  const label = labelKind(id, { selected, faulted: faultedModule });
  // The model's parent is the module group, the only scaled ancestor (`scene/Module.tsx`).
  const unit = 1 / (handle?.model.parent?.scale.x || 1);

  return (
    <group>
      {handle ? (
        <>
          <FloorRing radius={radius} fault={faulted} />
          {faulted ? null : <StatusLight height={height} />}
          {label === 'badge' ? (
            <FaultBadge id={id} height={height} unit={unit} selected={selected} />
          ) : label === 'tag' ? (
            <NameTag id={id} height={height} unit={unit} />
          ) : null}
          {isRepairable(id) ? (
            <>
              <SweepRing radius={radius} height={height} token={tokens.sweep} />
              <RingPing radius={radius} token={tokens.ping} />
              <Sparks radius={radius} height={height} token={tokens.burst} />
              <Glow radius={radius} height={height} token={tokens.burst} />
            </>
          ) : null}
        </>
      ) : null}
    </group>
  );
}
