import { describe, expect, it } from 'vitest';
import { badgeText, labelKind } from './labelRules';

describe('labelKind', () => {
  it('shows the fault badge on the broken module, whatever is selected', () => {
    expect(labelKind('generator', { selected: null, faulted: 'generator' })).toBe('badge');
    expect(labelKind('generator', { selected: 'generator', faulted: 'generator' })).toBe('badge');
    expect(labelKind('generator', { selected: 'habitat', faulted: 'generator' })).toBe('badge');
  });

  it('shows the generator tag in the overview only', () => {
    expect(labelKind('generator', { selected: null, faulted: null })).toBe('tag');
    expect(labelKind('generator', { selected: 'generator', faulted: null })).toBe('tag');
    expect(labelKind('generator', { selected: 'habitat', faulted: null })).toBeNull();
  });

  it('tags another module only while it is selected and nothing else is broken', () => {
    expect(labelKind('habitat', { selected: null, faulted: null })).toBeNull();
    expect(labelKind('habitat', { selected: 'habitat', faulted: null })).toBe('tag');
    expect(labelKind('habitat', { selected: 'habitat', faulted: 'generator' })).toBeNull();
    expect(labelKind('habitat', { selected: 'comms', faulted: null })).toBeNull();
  });

  it('never shows two labels at once (they would overlap from some angles)', () => {
    const ids = ['generator', 'oxygen', 'greenhouse', 'comms', 'habitat'] as const;
    for (const selected of [null, ...ids]) {
      for (const faulted of [null, 'generator'] as const) {
        const shown = ids.filter((id) => labelKind(id, { selected, faulted }) !== null);
        expect(shown.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('badgeText', () => {
  it('asks for a tap only while the module panel is closed', () => {
    expect(badgeText('generator', null)).toBe('⚠ 발전기 고장 · 눌러서 수리');
    expect(badgeText('generator', 'habitat')).toBe('⚠ 발전기 고장 · 눌러서 수리');
    expect(badgeText('generator', 'generator')).toBe('⚠ 발전기 고장');
  });
});
