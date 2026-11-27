/**
 * What `BaseRoom` attaches to every socket (`ws.serializeAttachment`, survives hibernation):
 * identity for `repaired.mine` (plan 005 D.11), the protocol from the upgrade URL (plan 006 B.12)
 * and the socket's current hold (plan 006 A.10). Pure. Track `server` implements the TODO bodies.
 */
import type { Hold } from './holds';

export interface SocketAttachment {
  id: string;
  /** From `socketProtocol(url)` at upgrade time. */
  protocol: 1 | 2;
  hold: Hold | null;
}

/** What `readAttachment` gives back; sockets opened before plan 005 carry nothing (`id` null, protocol 1). */
export interface SocketInfo {
  id: string | null;
  protocol: 1 | 2;
  hold: Hold | null;
}

/** A fresh attachment with id `newId()` and no hold (`BaseRoom` passes `() => crypto.randomUUID()`). */
export function newAttachment(newId: () => string, protocol: 1 | 2): SocketAttachment {
  return { id: newId(), protocol, hold: null };
}

function readHold(value: unknown): Hold | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { faultId, startedAt } = value as { faultId?: unknown; startedAt?: unknown };
  if (typeof faultId !== 'string' || faultId === '') return null;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null;
  return { faultId, startedAt };
}

/**
 * Reads a value from `ws.deserializeAttachment()` defensively: `id` as in `readSocketId`;
 * `protocol` 2 only when it is exactly 2, else 1; `hold` only when it is
 * `{ faultId: non-empty string, startedAt: finite number }`, else null.
 */
export function readAttachment(attachment: unknown): SocketInfo {
  const id = readSocketId(attachment);
  if (typeof attachment !== 'object' || attachment === null || Array.isArray(attachment)) {
    return { id, protocol: 1, hold: null };
  }
  const { protocol, hold } = attachment as { protocol?: unknown; hold?: unknown };
  return { id, protocol: protocol === 2 ? 2 : 1, hold: readHold(hold) };
}

/**
 * The id in a value read back with `ws.deserializeAttachment()`. Returns null unless it is an object
 * whose `id` is a non-empty string (sockets opened before plan 005 have no attachment).
 */
export function readSocketId(attachment: unknown): string | null {
  if (typeof attachment !== 'object' || attachment === null || Array.isArray(attachment)) return null;
  const id = (attachment as { id?: unknown }).id;
  return typeof id === 'string' && id !== '' ? id : null;
}

/** True only when both ids exist and are equal. Two missing ids are not the same socket. */
export function isMine(requesterId: string | null, socketId: string | null): boolean {
  return requesterId !== null && socketId !== null && requesterId === socketId;
}
