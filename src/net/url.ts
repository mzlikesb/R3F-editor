import { PROTOCOL_PARAM, PROTOCOL_VERSION } from '../../shared/protocol';

/** The WebSocket URL (plan 006 B.12). Track `client` implements the TODO body. */

/**
 * `wss://host/ws?protocol=2` on https, `ws://host/ws?protocol=2` otherwise (`PROTOCOL_PARAM`,
 * `PROTOCOL_VERSION` from `shared/protocol.ts`). The server reads the protocol at upgrade time, so the
 * very first snapshot already has the right shape.
 */
export function socketUrl(location: { protocol: string; host: string }): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws?${PROTOCOL_PARAM}=${PROTOCOL_VERSION}`;
}
