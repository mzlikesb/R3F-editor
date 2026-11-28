import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { selectActivity, selectBlackout, selectBaseIn, selectFaults, selectReady, useStore } from '../../store';
import { LabelPlanContext } from './labelPlanContext';
import { holdingModules, INTRO_MS, labelPlan } from './labelRules';

/** Computes the label plan once for the whole base; every module reads it with `useLabelPlan`. */
export function LabelPlanProvider({ children }: { children: ReactNode }) {
  const faults = useStore(selectFaults);
  const selected = useStore((s) => s.selected);
  const blackout = useStore(selectBlackout);
  const activity = useStore(selectActivity);
  // Mounted as soon as the base is in; `Anchored` keeps the label hidden until `selectReady` (#61).
  const baseIn = useStore(selectBaseIn);
  const shown = useStore(selectReady);
  // The faint names of the first screen run from the moment the labels become visible, once.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  const plan = useMemo(
    () => labelPlan({ ready: baseIn, faults, selected, blackout, holding: holdingModules(faults, activity), intro }),
    [baseIn, faults, selected, blackout, activity, intro],
  );
  return <LabelPlanContext.Provider value={plan}>{children}</LabelPlanContext.Provider>;
}
