/**
 * Route-change → Sentry breadcrumb.
 *
 * TanStack Router changes routes via history.pushState — no full page load.
 * Sentry's browserTracingIntegration only auto-instruments the initial load,
 * so SPA route changes need an explicit hook. Every navigation records one
 * breadcrumb; the breadcrumb chain gets attached to any subsequent error
 * report, giving triagers the "how did the user get here" context.
 *
 * Cheap: fires only when the pathname changes (not on unrelated re-renders),
 * and no-ops silently when Sentry isn't initialized (dev + no-DSN paths).
 */
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

import { addNavigationBreadcrumb } from "./sentry";

export function useSentryNavigationBreadcrumbs(): void {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    addNavigationBreadcrumb(pathname);
  }, [pathname]);
}
