import { useEffect } from 'react';
import { comboLabel, comboSpoken } from '../combo';
import { toastText, type Toast as ToastState } from '../feedback';
import { useStore } from '../store';
import './combo.css';

/**
 * The current toast; a timer sends `tick` when it expires (plan 005 D.12). A repair run of mine shows
 * its `x2`, `x3` right after the `+1` (plan 008 C.2).
 */
export function Toast({ toast }: { toast: ToastState }) {
  const { until } = toast;
  const combo = comboLabel(toast.combo);
  useEffect(() => {
    const id = setTimeout(
      () => useStore.getState().dispatchFeedback({ type: 'tick', now: performance.now() }),
      Math.max(0, until - performance.now()),
    );
    return () => clearTimeout(id);
  }, [until]);

  return (
    <p className={toast.kind === 'fault' ? 'toast toast-warn' : 'toast'} role="status">
      {toastText(toast)}
      {combo && (
        <>
          <span key={until} className="toast-combo" aria-hidden="true">
            {combo}
          </span>
          <span className="sr-only"> {comboSpoken(toast.combo)}</span>
        </>
      )}
    </p>
  );
}
