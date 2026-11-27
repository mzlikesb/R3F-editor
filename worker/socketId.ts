/**
 * Socket identity for `repaired.mine` (plan 005 D.11). Pure; `BaseRoom` stores the attachment with
 * `ws.serializeAttachment` when it accepts a socket (it survives hibernation) and compares ids when
 * it broadcasts. Contract with task `share` in `docs/plans/005-tasks.md`.
 */

/** What `BaseRoom` attaches to every accepted socket. */
export interface SocketAttachment {
  id: string;
}

/** A fresh attachment with id `newId()` (`BaseRoom` passes `() => crypto.randomUUID()`). */
export function newAttachment(newId: () => string): SocketAttachment {
  return { id: newId() };
}

/**
 * The id in a value read back with `ws.deserializeAttachment()`. Returns null unless it is an object
 * whose `id` is a non-empty string (sockets opened before this deploy have no attachment).
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
