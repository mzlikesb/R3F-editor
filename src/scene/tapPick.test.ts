import { describe, expect, it } from 'vitest';
import { PIECE_GHOST_MS, PIECE_PICK_PX, pickTap, tapTarget, type PieceHit, type TapHit } from './tapPick';

const body = (moduleId: 'oxygen' | 'generator'): TapHit => ({ moduleId, part: 'body' });
const margin = (moduleId: 'oxygen' | 'generator'): TapHit => ({ moduleId, part: 'margin' });
const piece: PieceHit = { piece: true };
const live = (distPx: number) => ({ live: true, distPx, goneMsAgo: 0 });
const gone = (distPx: number, goneMsAgo: number) => ({ live: false, distPx, goneMsAgo });

describe('pickTap', () => {
  it('takes the nearest body, else the nearest margin (#47)', () => {
    expect(pickTap([margin('oxygen'), body('generator')])).toBe('generator');
    expect(pickTap([margin('oxygen'), margin('generator')])).toBe('oxygen');
    expect(pickTap([])).toBeNull();
  });
});

describe('tapTarget (009-2 playtests: taps and the piece disagreed)', () => {
  it('a finger on the piece on screen takes the piece, even with a module box in front of it', () => {
    expect(tapTarget([margin('oxygen'), piece], live(PIECE_PICK_PX))).toBe('piece');
    expect(tapTarget([body('oxygen'), piece], live(4))).toBe('piece');
  });

  it('the piece in front of everything takes the tap wherever on its box', () => {
    expect(tapTarget([piece, body('generator')], live(80))).toBe('piece');
  });

  it('a tap on a module whose ray only grazes the piece box far from the piece stays on the module (pc-dev)', () => {
    expect(tapTarget([body('generator'), piece], live(PIECE_PICK_PX + 1))).toBe('generator');
    expect(tapTarget([margin('generator'), piece, body('oxygen')], live(120))).toBe('oxygen');
  });

  it('a tap where a piece just vanished (someone took it, its slot ended) does not open the module behind', () => {
    expect(tapTarget([margin('oxygen')], gone(10, PIECE_GHOST_MS))).toBe('gone');
    expect(tapTarget([margin('oxygen')], gone(10, PIECE_GHOST_MS + 1))).toBe('oxygen');
    expect(tapTarget([margin('oxygen')], gone(PIECE_PICK_PX + 1, 100))).toBe('oxygen');
    expect(tapTarget([], gone(10, 100))).toBe('gone');
  });

  it('without a piece it is the module pick', () => {
    expect(tapTarget([margin('oxygen'), body('generator')], null)).toBe('generator');
    expect(tapTarget([], null)).toBeNull();
  });
});
