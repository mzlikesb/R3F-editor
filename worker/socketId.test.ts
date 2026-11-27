import { describe, expect, it } from 'vitest';
import { isMine, newAttachment, readSocketId } from './socketId';

describe('newAttachment', () => {
  it('carries the generated id', () => {
    expect(newAttachment(() => 'abc')).toEqual({ id: 'abc' });
  });
});

describe('readSocketId', () => {
  it('reads the id back from an attachment', () => {
    expect(readSocketId({ id: 'abc' })).toBe('abc');
    expect(readSocketId(newAttachment(() => 'xyz'))).toBe('xyz');
  });

  it('returns null for sockets without a usable id', () => {
    expect(readSocketId(null)).toBeNull();
    expect(readSocketId(undefined)).toBeNull();
    expect(readSocketId('abc')).toBeNull();
    expect(readSocketId({})).toBeNull();
    expect(readSocketId({ id: '' })).toBeNull();
    expect(readSocketId({ id: 42 })).toBeNull();
    expect(readSocketId([{ id: 'abc' }])).toBeNull();
  });
});

describe('isMine', () => {
  it('is true only for the same id', () => {
    expect(isMine('a', 'a')).toBe(true);
    expect(isMine('a', 'b')).toBe(false);
  });

  it('never matches a missing id, not even another missing id', () => {
    expect(isMine(null, null)).toBe(false);
    expect(isMine(null, 'a')).toBe(false);
    expect(isMine('a', null)).toBe(false);
  });
});
