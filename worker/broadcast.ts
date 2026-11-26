/** Fan-out to sockets (plan 003). Contract with task S in `docs/plans/003-tasks.md`. */

/** The part of `WebSocket` that broadcasting needs; lets tests pass fakes. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/**
 * Sends `data` to every socket, each in its own try/catch. A socket whose `send` throws is closed
 * (a throwing `close` is swallowed too) and the rest still receive. Returns how many sends succeeded.
 */
export function broadcast(sockets: Iterable<SocketLike>, data: string): number {
  void sockets;
  void data;
  throw new Error('not implemented: broadcast (task S)');
}
