import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A render error anywhere in the tree otherwise unmounts the app and leaves a
 * blank page; this keeps the failure on screen and offers a way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="panel">
        <h1>Something broke</h1>
        <p className="error">{error.message}</p>
        <div className="actions">
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </section>
    );
  }
}
