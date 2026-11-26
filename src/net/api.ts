import { parseServerMessage } from '../../shared/protocol';
import { useStore } from '../store';

/** First paint: one `GET /api/base`. Failures are ignored; the socket fills the state anyway. */
export async function loadBase(): Promise<void> {
  try {
    const res = await fetch('/api/base');
    if (!res.ok) return;
    const msg = parseServerMessage(await res.text());
    if (msg?.type === 'snapshot') useStore.getState().applyRest(msg);
  } catch {
    // Offline or parser not ready: nothing to show yet.
  }
}
