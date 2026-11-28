import { describe, expect, it } from 'vitest';
import { pickTap, type PieceHit, type TapHit } from './tapPick';

const body = (moduleId: 'oxygen' | 'generator'): TapHit => ({ moduleId, part: 'body' });
const margin = (moduleId: 'oxygen' | 'generator'): TapHit => ({ moduleId, part: 'margin' });
const piece: PieceHit = { piece: true };

describe('pickTap', () => {
  it('takes the nearest body, else the nearest margin (#47)', () => {
    expect(pickTap([margin('oxygen'), body('generator')])).toBe('generator');
    expect(pickTap([margin('oxygen'), margin('generator')])).toBe('oxygen');
    expect(pickTap([])).toBeNull();
  });

  it('a parts piece under the finger wins over any module box, near or far (009-2 playtest)', () => {
    expect(pickTap([body('oxygen'), piece])).toBe('piece');
    expect(pickTap([margin('oxygen'), piece, body('generator')])).toBe('piece');
    expect(pickTap([piece])).toBe('piece');
  });
});
