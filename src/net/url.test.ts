import { describe, expect, it } from 'vitest';
import { socketProtocol } from '../../shared/protocol';
import { socketUrl } from './url';

describe('socketUrl', () => {
  it('asks for protocol 2 in the upgrade URL', () => {
    expect(socketUrl({ protocol: 'https:', host: 'outpost.example' })).toBe('wss://outpost.example/ws?protocol=2');
    expect(socketUrl({ protocol: 'http:', host: 'localhost:8787' })).toBe('ws://localhost:8787/ws?protocol=2');
  });

  it('is read back as protocol 2 by the server', () => {
    const url = socketUrl({ protocol: 'https:', host: 'x.dev' }).replace(/^wss:/, 'https:');
    expect(socketProtocol(new URL(url))).toBe(2);
  });
});
