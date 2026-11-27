import { createContext, useContext } from 'react';
import { labelPlan, type LabelPlan } from './labelRules';

const NO_LABELS: LabelPlan = labelPlan({ ready: false, faults: [], selected: null, blackout: false, holding: [] });
export const LabelPlanContext = createContext<LabelPlan>(NO_LABELS);

/** The label plan computed once for the whole base (`LabelPlanProvider`). */
export function useLabelPlan(): LabelPlan {
  return useContext(LabelPlanContext);
}
