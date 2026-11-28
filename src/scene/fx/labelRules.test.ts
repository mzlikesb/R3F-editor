import { describe, expect, it } from 'vitest';
import { MODULE_IDS, type Fault, type ModuleId } from '../../../shared/protocol';
import { badgeText, dotText, holdingModules, labelPlan, type LabelInput } from './labelRules';

const T = 1_800_000_000_000;
const f = (moduleId: ModuleId, age: number): Fault => ({ id: `f-${moduleId}`, moduleId, createdAt: T - age });

function plan(overrides: Partial<LabelInput>) {
  return labelPlan({ ready: true, faults: [], selected: null, blackout: false, holding: [], ...overrides });
}

describe('labelPlan: nothing broken (005 rule)', () => {
  it('tags the generator in the overview, or the selected module', () => {
    expect(plan({})).toEqual({ badge: null, dots: [], tag: 'generator' });
    expect(plan({ selected: 'habitat' })).toEqual({ badge: null, dots: [], tag: 'habitat' });
    expect(plan({ selected: 'generator' })).toEqual({ badge: null, dots: [], tag: 'generator' });
  });
});

describe('labelPlan: loading (playtest #47)', () => {
  it('shows no label until the scene and the base are in, so no tag sits on the loading badge', () => {
    const none = { badge: null, dots: [], tag: null };
    expect(plan({ ready: false })).toEqual(none);
    expect(plan({ ready: false, selected: 'habitat' })).toEqual(none);
    expect(plan({ ready: false, faults: [f('oxygen', 1)] })).toEqual(none);
  });
});

describe('labelPlan: one or more faults', () => {
  const oxy = f('oxygen', 30_000);
  const comms = f('comms', 20_000);
  const gen = f('generator', 10_000);

  it('one fault: its badge, no dots, no tag', () => {
    expect(plan({ faults: [oxy] })).toEqual({ badge: 'oxygen', dots: [], tag: null });
    expect(plan({ faults: [oxy], selected: 'habitat' })).toEqual({ badge: 'oxygen', dots: [], tag: null });
  });

  it('several: one big badge, the rest are dots in fault order', () => {
    const p = plan({ faults: [oxy, comms] });
    expect(p.badge).toBe('oxygen');
    expect(p.dots).toEqual(['comms']);
  });

  it('a selected broken module shows only its name tag: the panel says what is wrong (008 A.5)', () => {
    expect(plan({ faults: [oxy], selected: 'oxygen' })).toEqual({ badge: null, dots: [], tag: 'oxygen' });
    // The others stay as they were with that module selected: small dots.
    expect(plan({ faults: [oxy, gen, comms], selected: 'comms' })).toEqual({
      badge: null,
      dots: ['oxygen', 'generator'],
      tag: 'comms',
    });
  });

  it('an unselected broken module keeps its badge while another module is selected', () => {
    expect(plan({ faults: [oxy], selected: 'habitat' })).toEqual({ badge: 'oxygen', dots: [], tag: null });
    expect(plan({ faults: [oxy, gen], selected: 'habitat' }).badge).toBe('generator');
  });

  it('generator beats the oldest when nothing broken is selected', () => {
    expect(plan({ faults: [oxy, gen], selected: 'habitat' }).badge).toBe('generator');
  });

  it('(d) a module someone else is repairing is promoted from a dot to the badge', () => {
    const p = plan({ faults: [oxy, gen, comms], holding: ['comms'] });
    expect(p.badge).toBe('comms');
    expect(p.dots).toEqual(['oxygen', 'generator']);
    // ...even over the selected broken module.
    expect(plan({ faults: [oxy, comms], selected: 'oxygen', holding: ['comms'] }).badge).toBe('comms');
  });

  it('two being repaired: MODULE_IDS order; a selected one keeps its name tag instead', () => {
    expect(plan({ faults: [comms, oxy], holding: ['comms', 'oxygen'] }).badge).toBe('oxygen');
    expect(plan({ faults: [comms, oxy], holding: ['comms', 'oxygen'], selected: 'oxygen' })).toEqual({
      badge: 'comms',
      dots: [],
      tag: 'oxygen',
    });
  });

  it('(d) during a blackout the generator is always the badge, unless it is the one selected', () => {
    const p = plan({ faults: [oxy, comms, gen], blackout: true, holding: ['oxygen'], selected: 'comms' });
    expect(p.badge).toBe('generator');
    expect(p.dots).toEqual(['oxygen']);
    expect(p.tag).toBe('comms');
    expect(plan({ faults: [oxy, gen], blackout: true, selected: 'generator' })).toEqual({
      badge: null,
      dots: ['oxygen'],
      tag: 'generator',
    });
  });

  it('one label per broken module: the selected one a tag, every other the badge or a dot', () => {
    const faultSets = [[oxy], [oxy, comms], [oxy, comms, gen], [gen, f('habitat', 1)]];
    for (const faults of faultSets) {
      for (const selected of [null, ...MODULE_IDS]) {
        for (const blackout of [false, true]) {
          for (const holding of [[], ['oxygen'], ['comms', 'generator']] as ModuleId[][]) {
            const p = plan({
              faults,
              selected,
              blackout,
              holding: holding.filter((m) => faults.some((x) => x.moduleId === m)),
            });
            const broken = faults.map((x) => x.moduleId);
            const selectedBroken = selected !== null && broken.includes(selected);
            expect(p.tag).toBe(selectedBroken ? selected : null);
            const labelled = [p.badge, ...p.dots, p.tag].filter((id) => id !== null);
            expect(labelled.sort()).toEqual([...broken].sort());
          }
        }
      }
    }
  });
});

describe('holdingModules', () => {
  it('lists broken modules others are holding, in fault order', () => {
    const faults = [f('oxygen', 3), f('comms', 2), f('generator', 1)];
    expect(holdingModules(faults, { 'f-comms': 1, 'f-generator': 2 })).toEqual(['comms', 'generator']);
    expect(holdingModules(faults, { 'f-comms': 0, gone: 3 })).toEqual([]);
    expect(holdingModules(faults, {})).toEqual([]);
  });
});

describe('badgeText', () => {
  it('says what to do (M2 call to action), or that someone is repairing it', () => {
    expect(badgeText('generator', { othersHolding: false, panelOpen: false })).toBe('⚠ 발전기 고장 · 눌러서 수리');
    expect(badgeText('oxygen', { othersHolding: true, panelOpen: false })).toBe('⚠ 산소 탱크 고장 · 누군가 고치는 중');
  });

  it('drops the call to action while its panel is open (the panel button says how)', () => {
    expect(badgeText('oxygen', { othersHolding: false, panelOpen: true })).toBe('⚠ 산소 탱크 고장');
    expect(badgeText('oxygen', { othersHolding: true, panelOpen: true })).toBe('⚠ 산소 탱크 고장 · 누군가 고치는 중');
  });
});

describe('dotText', () => {
  it('names the module next to the mark, so a dot says which one is broken', () => {
    expect(dotText('habitat')).toBe('⚠ 거주 돔');
    expect(dotText('comms')).toBe('⚠ 통신탑');
  });
});
