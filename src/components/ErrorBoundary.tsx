/**
 * Top-of-tree React error boundary.
 *
 * Catches errors thrown during render, in lifecycle methods, and in constructors
 * of children. Does NOT catch:
 *   - Errors in event handlers (use try/catch there — we do this via toast in most handlers)
 *   - Errors in async code (useEffect + promise rejections — Sentry catches these via
 *     window.onerror / unhandledrejection listeners, wired by `initSentry()`)
 *   - Errors during SSR (server-side; the boundary is client-only)
 *
 * TanStack Router already has its own error boundary for ROUTE errors
 * (`defaultErrorComponent` in `router.tsx`). This boundary catches everything
 * OUTSIDE that — providers, top-level layout, notifications wiring, auth
 * context init. Without it, an unhandled render error in `<AuthProvider>` or
 * `<QueryClientProvider>` shows a white screen.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  /** Optional replacement UI; defaults to the built-in fallback below. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { componentStack: info.componentStack });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? <DefaultFallback error={this.state.error} onReset={this.reset} />
      );
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The app hit an unexpected error. Please try again — if it keeps happening, restart the
          app.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={onReset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
