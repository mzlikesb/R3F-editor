import { describe, expect, it } from 'vitest';
import { MAX_CLIENT_MESSAGE_BYTES, parseClientMessage, parseServerMessage } from './protocol';

const fault = { id: 'f1', moduleId: 'generator', createdAt: 1000 };

describe('parseServerMessage', () => {
  it('parses each server message type', () => {
    const snapshot = { type: 'snapshot', version: 3, fault, repairs: 2, presence: 1, instanceId: 'abc' };
    expect(parseServerMessage(JSON.stringify(snapshot))).toEqual(snapshot);

    const noFault = { ...snapshot, fault: null };
    expect(parseServerMessage(JSON.stringify(noFault))).toEqual(noFault);

    const faultMsg = { type: 'fault', version: 4, fault };
    expect(parseServerMessage(JSON.stringify(faultMsg))).toEqual(faultMsg);

    const repaired = { type: 'repaired', version: 5, faultId: 'f1', repairs: 3, mine: true };
    expect(parseServerMessage(JSON.stringify(repaired))).toEqual(repaired);
    expect(parseServerMessage(JSON.stringify({ ...repaired, mine: false }))).toEqual({ ...repaired, mine: false });

    const presence = { type: 'presence', count: 2 };
    expect(parseServerMessage(JSON.stringify(presence))).toEqual(presence);
  });

  it('rejects malformed or unknown input', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('null')).toBeNull();
    expect(parseServerMessage('[]')).toBeNull();
    expect(parseServerMessage('{"type":"other"}')).toBeNull();
    expect(parseServerMessage('{"type":"echo","data":"hi","instanceId":"abc"}')).toBeNull();
    expect(parseServerMessage('{"type":"repaired","version":"5","faultId":"f1","repairs":3}')).toBeNull();
    expect(parseServerMessage('{"type":"presence","count":"2"}')).toBeNull();
    expect(parseServerMessage('{"type":"fault","version":4,"fault":null}')).toBeNull();
    expect(parseServerMessage('{"type":"snapshot","version":3,"repairs":2,"presence":1}')).toBeNull();
  });
});

describe('parseServerMessage repaired.mine', () => {
  const base = { type: 'repaired', version: 5, faultId: 'f1', repairs: 3 };

  it('reads a missing mine as false (older servers)', () => {
    expect(parseServerMessage(JSON.stringify(base))).toEqual({ ...base, mine: false });
  });

  it('counts only the boolean true as mine', () => {
    for (const mine of ['true', 1, null, {}]) {
      expect(parseServerMessage(JSON.stringify({ ...base, mine }))).toEqual({ ...base, mine: false });
    }
  });
});

describe('parseClientMessage', () => {
  it('parses a repair request and drops extra fields', () => {
    expect(parseClientMessage('{"type":"repair","faultId":"f1"}')).toEqual({ type: 'repair', faultId: 'f1' });
    expect(parseClientMessage('{"type":"repair","faultId":"f1","extra":1}')).toEqual({
      type: 'repair',
      faultId: 'f1',
    });
  });

  it('ignores malformed, unknown, and binary messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('null')).toBeNull();
    expect(parseClientMessage('"repair"')).toBeNull();
    expect(parseClientMessage('{"type":"other","faultId":"f1"}')).toBeNull();
    expect(parseClientMessage('{"type":"repair"}')).toBeNull();
    expect(parseClientMessage('{"type":"repair","faultId":1}')).toBeNull();
    expect(parseClientMessage('{"type":"repair","faultId":""}')).toBeNull();
    expect(parseClientMessage('ping')).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });

  it(`ignores messages over ${MAX_CLIENT_MESSAGE_BYTES} bytes, counting UTF-8 bytes`, () => {
    const wrap = (id: string) => `{"type":"repair","faultId":"${id}"}`;
    const overhead = wrap('').length;

    const fits = wrap('a'.repeat(MAX_CLIENT_MESSAGE_BYTES - overhead));
    expect(new TextEncoder().encode(fits).byteLength).toBe(MAX_CLIENT_MESSAGE_BYTES);
    expect(parseClientMessage(fits)).not.toBeNull();

    expect(parseClientMessage(wrap('a'.repeat(MAX_CLIENT_MESSAGE_BYTES - overhead + 1)))).toBeNull();

    // Fewer than 256 UTF-16 code units but more than 256 UTF-8 bytes.
    const multibyte = wrap('가'.repeat(80));
    expect(multibyte.length).toBeLessThanOrEqual(MAX_CLIENT_MESSAGE_BYTES);
    expect(parseClientMessage(multibyte)).toBeNull();
  });
});
