import { describe, expect, it } from 'vitest';
import { broadcast, type SocketLike } from './broadcast';

class FakeSocket implements SocketLike {
  received: string[] = [];
  closed = false;
  private readonly failSend: boolean;
  private readonly failClose: boolean;
  constructor(failSend = false, failClose = false) {
    this.failSend = failSend;
    this.failClose = failClose;
  }
  send(data: string): void {
    if (this.failSend) throw new Error('send failed');
    this.received.push(data);
  }
  close(): void {
    this.closed = true;
    if (this.failClose) throw new Error('close failed');
  }
}

describe('broadcast', () => {
  it('sends to every socket', () => {
    const sockets = [new FakeSocket(), new FakeSocket()];
    expect(broadcast(sockets, 'm')).toBe(2);
    for (const s of sockets) expect(s.received).toEqual(['m']);
  });

  it('keeps going when one socket fails, and closes that socket', () => {
    const ok1 = new FakeSocket();
    const bad = new FakeSocket(true);
    const ok2 = new FakeSocket();
    expect(broadcast([ok1, bad, ok2], 'm')).toBe(2);
    expect(ok1.received).toEqual(['m']);
    expect(ok2.received).toEqual(['m']);
    expect(bad.closed).toBe(true);
    expect(ok1.closed).toBe(false);
  });

  it('survives a socket whose close also throws', () => {
    const bad = new FakeSocket(true, true);
    const ok = new FakeSocket();
    expect(() => broadcast([bad, ok], 'm')).not.toThrow();
    expect(ok.received).toEqual(['m']);
  });
});
