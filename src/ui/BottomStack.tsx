import { bottomStack, hintVisible } from '../feedback';
import { selectAnyFault, useStore } from '../store';
import { Hint } from './Hint';
import { Panel } from './Panel';
import { RecordPanel } from './RecordPanel';
import { Toast } from './Toast';

/**
 * Bottom of the screen: panel > toast > hint (plan 005 D.12, `feedback.bottomStack`). The first
 * item sits on the edge; the rest stack upward, so a toast or hint never covers the panel.
 */
export function BottomStack() {
  const hasPanel = useStore((s) => s.selected !== null || s.historyOpen);
  const history = useStore((s) => s.historyOpen);
  const toast = useStore((s) => s.feedback.toast);
  const hint = useStore((s) => hintVisible(selectAnyFault(s), s.feedback, s.loaded));
  const items = bottomStack({ panel: hasPanel, toast: toast !== null, hint });
  if (items.length === 0) return null;
  return (
    <div className="bottom-stack">
      {items.map((item) => {
        if (item === 'panel') return history ? <RecordPanel key="record" /> : <Panel key="panel" />;
        if (item === 'toast') return toast && <Toast key="toast" toast={toast} />;
        return <Hint key="hint" />;
      })}
    </div>
  );
}
