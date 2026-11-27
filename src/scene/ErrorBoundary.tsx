import { Component, type ReactNode } from 'react';

interface Props {
  /** Rendered in place of the children once one of them throws. */
  fallback: ReactNode;
  onError?: (error: Error) => void;
  children: ReactNode;
}

/** Catches load failures (GLB, HDRI) so one broken asset does not take the canvas down. */
export class SceneErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
