import { PING, PING_INTERVAL_MS, PONG_TIMEOUT_MS, parseServerMessage, type RepairRequest } from '../../shared/protocol';
import { setRepairSender, useStore } from '../store';
import { reconnectDelayMs } from './backoff';

/**
 * Connects to `/ws` and keeps it alive. `open` is reported only after the first snapshot of a
 * connection is applied. Returns a stop function.
 */
export function startSocket(): () => void {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const store = () => useStore.getState();

  function clearHeartbeat() {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pongTimer = undefined;
  }

  /** Detaches the current socket and schedules a reconnect. */
  function drop() {
    clearHeartbeat();
    const old = ws;
    ws = null;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try {
        old.close();
      } catch {
        // Already closed.
      }
    }
    if (stopped) return;
    store().setConnection('reconnecting');
    store().dispatchHold({ type: 'disconnect', now: performance.now() });
    retryTimer = setTimeout(connect, reconnectDelayMs(attempt++));
  }

  function connect() {
    if (stopped) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(`${proto}://${location.host}/ws`);
    ws = sock;
    sock.onopen = () => {
      pingTimer = setInterval(() => {
        if (sock.readyState !== WebSocket.OPEN) return;
        sock.send(PING);
        clearTimeout(pongTimer);
        pongTimer = setTimeout(() => {
          if (ws === sock) drop();
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);
    };
    sock.onmessage = (ev: MessageEvent) => {
      // Any frame proves the connection is alive. Heartbeat frames are not protocol messages.
      clearTimeout(pongTimer);
      pongTimer = undefined;
      if (typeof ev.data !== 'string') return;
      let msg;
      try {
        msg = parseServerMessage(ev.data);
      } catch {
        return;
      }
      if (!msg) return;
      const now = performance.now();
      store().applyMessage(msg);
      if (msg.type === 'snapshot') {
        attempt = 0;
        store().setConnection('open');
        store().dispatchHold({ type: 'snapshot', now });
      } else if (msg.type === 'repaired') {
        store().dispatchHold({ type: 'repaired', faultId: msg.faultId, now });
      }
    };
    sock.onclose = () => {
      if (ws === sock) drop();
    };
    sock.onerror = () => {
      if (ws === sock) drop();
    };
  }

  setRepairSender((req: RepairRequest) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(req));
  });
  connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    setRepairSender(null);
    drop();
  };
}
