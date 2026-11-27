import { useMemo, type ReactNode } from 'react';
import { selectActivity, selectBlackout, selectFaults, useStore } from '../../store';
import { LabelPlanContext } from './labelPlanContext';
import { holdingModules, labelPlan } from './labelRules';

/** Computes the label plan once for the whole base; every module reads it with `useLabelPlan`. */
export function LabelPlanProvider({ children }: { children: ReactNode }) {
  const faults = useStore(selectFaults);
  const selected = useStore((s) => s.selected);
  const blackout = useStore(selectBlackout);
  const activity = useStore(selectActivity);
  const plan = useMemo(
    () => labelPlan({ faults, selected, blackout, holding: holdingModules(faults, activity) }),
    [faults, selected, blackout, activity],
  );
  return <LabelPlanContext.Provider value={plan}>{children}</LabelPlanContext.Provider>;
}
