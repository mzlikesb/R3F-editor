import { describe, expect, it } from 'vitest';
import { parseServerMessage } from './protocol';

describe('parseServerMessage', () => {
  it('parses an echo message', () => {
    expect(parseServerMessage('{"type":"echo","data":"hi","instanceId":"abc"}')).toEqual({
      type: 'echo',
      data: 'hi',
      instanceId: 'abc',
    });
  });

  it('rejects malformed or unknown input', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('null')).toBeNull();
    expect(parseServerMessage('{"type":"echo","data":1,"instanceId":"abc"}')).toBeNull();
    expect(parseServerMessage('{"type":"other"}')).toBeNull();
  });
});
