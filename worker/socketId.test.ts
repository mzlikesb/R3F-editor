import { describe, expect, it } from 'vitest';
import { isMine, newAttachment, readAttachment, readSocketId } from './socketId';

describe('newAttachment', () => {
  it('carries the generated id, the protocol and no hold', () => {
    expect(newAttachment(() => 'abc', 2)).toEqual({ id: 'abc', protocol: 2, hold: null });
    expect(newAttachment(() => 'abc', 1)).toEqual({ id: 'abc', protocol: 1, hold: null });
  });
});

describe('readAttachment', () => {
  it('reads back what newAttachment made, with a hold', () => {
    const att = { ...newAttachment(() => 'abc', 2), hold: { faultId: 'f1', startedAt: 5 } };
    expect(readAttachment(att)).toEqual(att);
  });

  it('treats sockets from before the deploy as protocol 1 without a hold', () => {
    expect(readAttachment(null)).toEqual({ id: null, protocol: 1, hold: null });
    expect(readAttachment({ id: 'abc' })).toEqual({ id: 'abc', protocol: 1, hold: null });
  });

  it('drops a malformed protocol or hold', () => {
    expect(readAttachment({ id: 'a', protocol: '2', hold: null }).protocol).toBe(1);
    expect(readAttachment({ id: 'a', protocol: 3, hold: null }).protocol).toBe(1);
    expect(readAttachment({ id: 'a', protocol: 2, hold: { faultId: '', startedAt: 1 } }).hold).toBeNull();
    expect(readAttachment({ id: 'a', protocol: 2, hold: { faultId: 'f', startedAt: 'x' } }).hold).toBeNull();
    expect(readAttachment({ id: 'a', protocol: 2, hold: 'f' }).hold).toBeNull();
  });
});

describe('readSocketId', () => {
  it('reads the id back from an attachment', () => {
    expect(readSocketId({ id: 'abc' })).toBe('abc');
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
