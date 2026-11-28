import { describe, expect, it } from 'vitest';
import { LABEL_WRAPPER_STYLE } from './labelRules';

describe('label wrapper (#105)', () => {
  it('lets taps through the invisible box `Html` leaves over the module body', () => {
    expect(LABEL_WRAPPER_STYLE.pointerEvents).toBe('none');
  });
});
