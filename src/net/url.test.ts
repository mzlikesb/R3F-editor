import { describe, expect, it } from 'vitest';
import { socketProtocol } from '../../shared/protocol';
import { socketUrl } from './url';

describe('socketUrl', () => {
  it('asks for protocol 3 in the upgrade URL', () => {
    expect(socketUrl({ protocol: 'https:', host: 'outpost.example' })).toBe('wss://outpost.example/ws?protocol=3');
    expect(socketUrl({ protocol: 'http:', host: 'localhost:8787' })).toBe('ws://localhost:8787/ws?protocol=3');
  });

  it('is read back as a versioned socket by the server', () => {
    const url = socketUrl({ protocol: 'https:', host: 'x.dev' }).replace(/^wss:/, 'https:');
    expect(socketProtocol(new URL(url))).toBe(2);
  });
});
