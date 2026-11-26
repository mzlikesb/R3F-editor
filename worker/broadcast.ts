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
  let sent = 0;
  for (const socket of sockets) {
    try {
      socket.send(data);
      sent++;
    } catch {
      try {
        socket.close(1011, 'send failed');
      } catch {
        // already gone
      }
    }
  }
  return sent;
}
