import { beforeEach, describe, expect, it } from 'vitest';
import { GENERATOR } from '../shared/protocol';
import { initialRepairUi } from './hold';
import { setRepairSender, useStore } from './store';

describe('store.select', () => {
  beforeEach(() => {
    useStore.setState({ selected: GENERATOR, repair: initialRepairUi });
    setRepairSender(null);
  });

  it('cancels a hold in progress when the selection moves away', () => {
    const sent: unknown[] = [];
    setRepairSender((req) => sent.push(req));
    const { dispatchHold, select } = useStore.getState();
    dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    expect(useStore.getState().repair.hold.kind).toBe('holding');

    select(null);
    expect(useStore.getState().repair.hold.kind).toBe('idle');

    // The hold would have completed at 1 s; nothing goes out.
    useStore.getState().dispatchHold({ type: 'tick', now: 2000 });
    expect(sent).toEqual([]);
  });

  it('leaves the hold alone when the same module is selected again', () => {
    const { dispatchHold, select } = useStore.getState();
    dispatchHold({ type: 'press', faultId: 'f1', now: 0 });
    select(GENERATOR);
    expect(useStore.getState().repair.hold.kind).toBe('holding');
  });
});
