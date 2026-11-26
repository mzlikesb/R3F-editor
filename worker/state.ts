/**
 * Pure rules for the shared base (plan 003). No I/O: `BaseRoom` reads storage and the alarm,
 * calls these, saves, then broadcasts. Contract with task S in `docs/plans/003-tasks.md`.
 */
import { GENERATOR, type Fault, type SnapshotMessage } from '../shared/protocol';

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
  return { fault: null, repairs: 0, version: 0, instanceId };
}

/**
 * Clears the fault and adds one repair, only when `faultId` is the current fault.
 * Otherwise returns `state` itself (same reference), so a repeat or stale repair changes nothing.
 */
export function repair(state: BaseState, faultId: string): BaseState {
  if (!state.fault || state.fault.id !== faultId) return state;
  return { ...state, fault: null, repairs: state.repairs + 1, version: state.version + 1 };
}

/**
 * Creates a fault on the generator with id `newId()` when there is none.
 * Returns `state` itself (same reference) when a fault already exists.
 */
export function ensureFault(state: BaseState, now: number, newId: () => string): BaseState {
  if (state.fault) return state;
  const fault: Fault = { id: newId(), moduleId: GENERATOR, createdAt: now };
  return { ...state, fault, version: state.version + 1 };
}

/** First visit: the base just went from 0 to 1 connection, with no fault and nothing scheduled. */
export function shouldFirstVisitFault(facts: RoomFacts): boolean {
  return facts.connections === 1 && facts.fault === null && !facts.hasAlarm;
}

/** Someone is here, but there is no fault and no alarm: the base would stay healthy forever. */
export function needsSelfHeal(facts: RoomFacts): boolean {
  return facts.connections > 0 && facts.fault === null && !facts.hasAlarm;
}

/**
 * On a new connection (counted in `connections`): first-visit fault wins, else self-heal schedules
 * an alarm, else nothing. After a client message, `BaseRoom` uses `needsSelfHeal` on the new state
 * (this is also how the alarm gets scheduled after a successful repair).
 */
export function decideOnConnect(facts: RoomFacts): ConnectAction {
  if (shouldFirstVisitFault(facts)) return 'createFault';
  if (needsSelfHeal(facts)) return 'scheduleAlarm';
  return 'none';
}

/**
 * When the alarm fires. Idempotent: a fault already present → nothing. Nobody connected →
 * nothing, and no reschedule (the next first visit handles it). Otherwise → create a fault.
 * No self-heal branch here.
 */
export function decideOnAlarm(facts: Pick<RoomFacts, 'connections' | 'fault'>): AlarmAction {
  return facts.fault === null && facts.connections > 0 ? 'createFault' : 'none';
}

/** Delay until the next fault, in [REFAULT_MIN_MS, REFAULT_MAX_MS]. `rand` returns [0, 1). */
export function nextFaultDelayMs(rand: () => number): number {
  return REFAULT_MIN_MS + Math.floor(rand() * (REFAULT_MAX_MS - REFAULT_MIN_MS + 1));
}

/** Open sockets, leaving out `closing` (in close/error callbacks it may still be listed). */
export function countPresence<T>(sockets: readonly T[], closing?: T): number {
  return closing === undefined ? sockets.length : sockets.filter((s) => s !== closing).length;
}

export function toSnapshot(state: BaseState, presence: number): SnapshotMessage {
  return {
    type: 'snapshot',
    version: state.version,
    fault: state.fault,
    repairs: state.repairs,
    presence,
    instanceId: state.instanceId,
  };
}
