/**
 * Pure rules for the shared base (plan 003). No I/O: `BaseRoom` reads storage and the alarm,
 * calls these, saves, then broadcasts. Contract with task S in `docs/plans/003-tasks.md`.
 */
import type { Fault, SnapshotMessage } from '../shared/protocol';

/** Re-fault delay after a repair is drawn from [REFAULT_MIN_MS, REFAULT_MAX_MS]. */
export const REFAULT_MIN_MS = 20_000;
export const REFAULT_MAX_MS = 40_000;

/** What `BaseRoom` stores, as one object under one key. */
export interface BaseState {
  fault: Fault | null;
  repairs: number;
  /** +1 on every change to `fault` or `repairs`. */
  version: number;
  instanceId: string;
}

/** Facts `BaseRoom` gathers before deciding. `hasAlarm` is `(await ctx.storage.getAlarm()) !== null`. */
export interface RoomFacts {
  /** Open sockets, already excluding a socket that is closing. */
  connections: number;
  fault: Fault | null;
  hasAlarm: boolean;
}

export type ConnectAction = 'createFault' | 'scheduleAlarm' | 'none';
export type AlarmAction = 'createFault' | 'none';

/** A fresh base: no fault, no repairs, version 0. */
export function initialState(instanceId: string): BaseState {
  void instanceId;
  throw new Error('not implemented: initialState (task S)');
}

/**
 * Clears the fault and adds one repair, only when `faultId` is the current fault.
 * Otherwise returns `state` itself (same reference), so a repeat or stale repair changes nothing.
 */
export function repair(state: BaseState, faultId: string): BaseState {
  void state;
  void faultId;
  throw new Error('not implemented: repair (task S)');
}

/**
 * Creates a fault on the generator with id `newId()` when there is none.
 * Returns `state` itself (same reference) when a fault already exists.
 */
export function ensureFault(state: BaseState, now: number, newId: () => string): BaseState {
  void state;
  void now;
  void newId;
  throw new Error('not implemented: ensureFault (task S)');
}

/** First visit: the base just went from 0 to 1 connection, with no fault and nothing scheduled. */
export function shouldFirstVisitFault(facts: RoomFacts): boolean {
  void facts;
  throw new Error('not implemented: shouldFirstVisitFault (task S)');
}

/** Someone is here, but there is no fault and no alarm: the base would stay healthy forever. */
export function needsSelfHeal(facts: RoomFacts): boolean {
  void facts;
  throw new Error('not implemented: needsSelfHeal (task S)');
}

/**
 * On a new connection (counted in `connections`): first-visit fault wins, else self-heal schedules
 * an alarm, else nothing. After a client message, `BaseRoom` uses `needsSelfHeal` on the new state
 * (this is also how the alarm gets scheduled after a successful repair).
 */
export function decideOnConnect(facts: RoomFacts): ConnectAction {
  void facts;
  throw new Error('not implemented: decideOnConnect (task S)');
}

/**
 * When the alarm fires. Idempotent: a fault already present → nothing. Nobody connected →
 * nothing, and no reschedule (the next first visit handles it). Otherwise → create a fault.
 * No self-heal branch here.
 */
export function decideOnAlarm(facts: Pick<RoomFacts, 'connections' | 'fault'>): AlarmAction {
  void facts;
  throw new Error('not implemented: decideOnAlarm (task S)');
}

/** Delay until the next fault, in [REFAULT_MIN_MS, REFAULT_MAX_MS]. `rand` returns [0, 1). */
export function nextFaultDelayMs(rand: () => number): number {
  void rand;
  throw new Error('not implemented: nextFaultDelayMs (task S)');
}

/** Open sockets, leaving out `closing` (in close/error callbacks it may still be listed). */
export function countPresence<T>(sockets: readonly T[], closing?: T): number {
  void sockets;
  void closing;
  throw new Error('not implemented: countPresence (task S)');
}

export function toSnapshot(state: BaseState, presence: number): SnapshotMessage {
  void state;
  void presence;
  throw new Error('not implemented: toSnapshot (task S)');
}
