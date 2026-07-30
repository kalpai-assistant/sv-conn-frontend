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
import { ErrorBoundaryFallback } from "./ErrorBoundaryFallback";

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
        this.props.fallback ?? (
          <ErrorBoundaryFallback error={this.state.error} onReset={this.reset} />
        )
      );
    }
    return this.props.children;
  }
}
