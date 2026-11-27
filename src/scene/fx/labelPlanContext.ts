import { createContext, useContext } from 'react';
import { labelPlan, type LabelPlan } from './labelRules';

const NOTHING_BROKEN: LabelPlan = labelPlan({ faults: [], selected: null, blackout: false, holding: [] });
export const LabelPlanContext = createContext<LabelPlan>(NOTHING_BROKEN);

/** The label plan computed once for the whole base (`LabelPlanProvider`). */
export function useLabelPlan(): LabelPlan {
  return useContext(LabelPlanContext);
}
