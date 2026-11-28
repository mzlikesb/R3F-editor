import { useSyncExternalStore } from 'react';

/** Made once at module load (null outside a browser), not on every render. */
const QUERY: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

function subscribe(onChange: () => void): () => void {
  QUERY?.addEventListener('change', onChange);
  return () => QUERY?.removeEventListener('change', onChange);
}

const snapshot = () => QUERY?.matches ?? false;
const serverSnapshot = () => false;

/** `prefers-reduced-motion: reduce`, live: turning it on in the OS re-renders the caller. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
