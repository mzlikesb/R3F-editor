/**
 * Test fixture (plan 009 R3): what the server sent and stored at main 8d0ee47, before plan 009
 * added the parts store. Made by running that commit's `worker/state.ts` (`initialState`, two
 * `injectFault`, one `repair`, `toSnapshot`) and the `repaired` shape `worker/BaseRoom.ts` built.
 * Frozen text: never regenerate it from the current code. Tests add the 009 fields to these and
 * check that today's parser and `loadState` still read every old field the same.
 */

/** A protocol-2 `snapshot` frame. */
export const PRE009_SNAPSHOT =
  '{"type":"snapshot","protocol":2,"version":3,"faults":[{"id":"00000000-0000-4000-8000-000000000002","moduleId":"habitat","createdAt":1795000030000}],"repairs":1,"uptimeStartedAt":1795000000000,"longestUptimeMs":0,"blackout":null,"blackouts":[],"lastRepair":{"moduleId":"comms","at":1795000041000},"presence":2,"instanceId":"6f1c2a9e-4b7d-4e21-9a3c-5d8e7f60b112","serverNow":1795000042000}';

/** A protocol-2 `repaired` frame (the requester's copy). */
export const PRE009_REPAIRED =
  '{"type":"repaired","version":3,"faultId":"00000000-0000-4000-8000-000000000001","moduleId":"comms","repairs":1,"mine":true,"helped":false,"helpers":1,"at":1795000041000,"blackoutEnd":null}';

/** The `base:v2` value in storage, as JSON. */
export const PRE009_STORED =
  '{"faults":[{"id":"00000000-0000-4000-8000-000000000002","moduleId":"habitat","createdAt":1795000030000}],"repairs":1,"version":3,"instanceId":"6f1c2a9e-4b7d-4e21-9a3c-5d8e7f60b112","uptimeStartedAt":1795000000000,"longestUptimeMs":0,"blackout":null,"blackouts":[],"nextFaultAt":1795000067000,"lastSavedAt":1795000041000,"lastRepair":{"moduleId":"comms","at":1795000041000}}';
