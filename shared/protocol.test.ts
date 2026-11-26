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

it('CI 실패 감지 확인용 (곧 되돌림)', () => {
  expect(1).toBe(2);
});
