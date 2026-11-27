import { useEffect } from 'react';
import { TOAST_TEXT, type Toast as ToastState } from '../feedback';
import { useStore } from '../store';

/** The current toast; a timer sends `tick` when it expires (plan 005 D.12). */
export function Toast({ toast }: { toast: ToastState }) {
  const { until } = toast;
  useEffect(() => {
    const id = setTimeout(
      () => useStore.getState().dispatchFeedback({ type: 'tick', now: performance.now() }),
      Math.max(0, until - performance.now()),
    );
    return () => clearTimeout(id);
  }, [until]);

  return (
    <p className={toast.kind === 'refault' ? 'toast toast-warn' : 'toast'} role="status">
      {TOAST_TEXT[toast.kind]}
    </p>
  );
}
