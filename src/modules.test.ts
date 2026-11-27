import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '../shared/protocol';
import { MODULES, hasFinalConsonant, moduleName, withObjectParticle, withSubjectParticle } from './modules';

describe('modules', () => {
  it('lists every server module, generator first, with a name', () => {
    expect(MODULES.map((m) => m.id)).toEqual(MODULE_IDS);
    expect(MODULES.map((m) => m.name)).toEqual(['발전기', '산소 탱크', '온실', '통신탑', '거주 돔']);
    expect(moduleName('comms')).toBe('통신탑');
  });

  it('picks the particle from the last syllable', () => {
    expect(hasFinalConsonant('온실')).toBe(true);
    expect(hasFinalConsonant('발전기')).toBe(false);
    expect(hasFinalConsonant('kW')).toBe(false);
    expect(MODULES.map((m) => withObjectParticle(m.name))).toEqual([
      '발전기를',
      '산소 탱크를',
      '온실을',
      '통신탑을',
      '거주 돔을',
    ]);
    expect(MODULES.map((m) => withSubjectParticle(m.name))).toEqual([
      '발전기가',
      '산소 탱크가',
      '온실이',
      '통신탑이',
      '거주 돔이',
    ]);
  });
});
