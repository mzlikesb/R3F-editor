import { Panel } from './Panel';

/**
 * Bottom of the screen: panel > toast > hint (plan 005 D.12, `feedback.bottomStack`), plus the
 * toast's own timer. Track `share`. Until then it only renders the panel.
 */
export function BottomStack() {
  return <Panel />;
}
