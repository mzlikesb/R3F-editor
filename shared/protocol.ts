/** Messages shared by the client and the Worker. Single source of truth. */

/** Largest client message the server accepts, in bytes. */
export const MAX_CLIENT_MESSAGE_BYTES = 256;

export interface EchoMessage {
  type: 'echo';
  /** The text the client sent. */
  data: string;
  /** Random id stored once per Durable Object; differs across isolated environments. */
  instanceId: string;
}

export type ServerMessage = EchoMessage;

/** Parses a server message, returning null for anything that is not a known message. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const msg = value as Record<string, unknown>;
  if (msg['type'] === 'echo' && typeof msg['data'] === 'string' && typeof msg['instanceId'] === 'string') {
    return { type: 'echo', data: msg['data'], instanceId: msg['instanceId'] };
  }
  return null;
}
