/** Client store. It mirrors server state through the pure reducers; it never changes the base itself. */
import { create } from 'zustand';
import type { ModuleId, RepairRequest, ServerMessage, SnapshotMessage } from '../shared/protocol';
import { initialRepairUi, reduceHold, type HoldEvent, type RepairUi } from './hold';
import { applyRestSnapshot, applyServerMessage, initialSync, type ConnectionStatus, type SyncState } from './sync';

interface Store {
  sync: SyncState;
  connection: ConnectionStatus;
  selected: ModuleId | null;
  repair: RepairUi;
  applyMessage: (msg: ServerMessage) => void;
  applyRest: (snap: SnapshotMessage) => void;
  setConnection: (status: ConnectionStatus) => void;
  select: (id: ModuleId | null) => void;
  /** Feeds the hold state machine; a completed hold goes out through the registered sender. */
  dispatchHold: (event: HoldEvent) => void;
}

let sender: ((req: RepairRequest) => void) | null = null;

/** `net/socket.ts` registers how to put a repair request on the wire. */
export function setRepairSender(fn: ((req: RepairRequest) => void) | null): void {
  sender = fn;
}

export const useStore = create<Store>((set, get) => ({
  sync: initialSync,
  connection: 'connecting',
  selected: null,
  repair: initialRepairUi,
  applyMessage: (msg) => set((s) => ({ sync: applyServerMessage(s.sync, msg) })),
  applyRest: (snap) => set((s) => ({ sync: applyRestSnapshot(s.sync, snap) })),
  setConnection: (connection) => set({ connection }),
  select: (selected) => set({ selected }),
  dispatchHold: (event) => {
    const { ui, send } = reduceHold(get().repair, event);
    if (ui !== get().repair) set({ repair: ui });
    if (send) sender?.(send);
  },
}));
