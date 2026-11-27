import { useMemo, type ReactNode } from 'react';
import { selectActivity, selectBlackout, selectFaults, selectReady, useStore } from '../../store';
import { LabelPlanContext } from './labelPlanContext';
import { holdingModules, labelPlan } from './labelRules';

/** Computes the label plan once for the whole base; every module reads it with `useLabelPlan`. */
export function LabelPlanProvider({ children }: { children: ReactNode }) {
  const faults = useStore(selectFaults);
  const selected = useStore((s) => s.selected);
  const blackout = useStore(selectBlackout);
  const activity = useStore(selectActivity);
  const ready = useStore(selectReady);
  const plan = useMemo(
    () => labelPlan({ ready, faults, selected, blackout, holding: holdingModules(faults, activity) }),
    [ready, faults, selected, blackout, activity],
  );
  return <LabelPlanContext.Provider value={plan}>{children}</LabelPlanContext.Provider>;
}
