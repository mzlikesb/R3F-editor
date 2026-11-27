/**
 * Protocol 1 for tabs opened before the deploy (plan 006 B.13). Pure. A protocol-1 socket never
 * gets event messages (`fault`, `activity`); it gets an old-shape snapshot whenever what it can see
 * changed, and an old-shape `repaired` when the generator fault was repaired. Track `server`
 * implements the TODO bodies; `legacy.test.ts` runs the output through the deployed parser and
 * reducer (`shared/testdata/v1.ts`).
 */
import type { Fault, LegacyRepairedMessage, LegacySnapshotMessage } from '../shared/protocol';
import type { BaseState } from './state';

/** Old-shape snapshot: `fault` is the generator fault or null; `version` is the state's version. */
export function toLegacySnapshot(state: BaseState, presence: number): LegacySnapshotMessage {
  void state;
  void presence;
  throw new Error('TODO(server): toLegacySnapshot');
}

/** Old-shape `repaired` for the generator fault `faultId`, with this socket's `mine`. */
export function toLegacyRepaired(state: BaseState, faultId: string, mine: boolean): LegacyRepairedMessage {
  void state;
  void faultId;
  void mine;
  throw new Error('TODO(server): toLegacyRepaired');
}

/**
 * What protocol-1 sockets get after `before` → `after`:
 * - `repaired`: `repairedFault` is the generator's (send `toLegacyRepaired` to each, with `mine`);
 * - `snapshot`: otherwise, when the generator fault id or `repairs` changed (send `toLegacySnapshot`);
 * - null: nothing they can see changed (e.g. a fault on another module).
 */
export function legacyUpdate(
  before: BaseState,
  after: BaseState,
  repairedFault: Fault | null,
): 'repaired' | 'snapshot' | null {
  void before;
  void after;
  void repairedFault;
  throw new Error('TODO(server): legacyUpdate');
}
