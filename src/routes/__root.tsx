import { Outlet, Link, createRootRoute, useRouterState, Navigate } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { CartProvider } from "@/lib/cart-context";
import { useNotificationRouter } from "@/lib/notifications";
import { useFcmRegistration } from "@/lib/fcm";
import { BottomNav } from "@/components/BottomNav";
import { CartFab } from "@/components/cart/CartFab";
import { SplashGate } from "@/components/SplashGate";
import { IncomingRequestHost } from "@/components/provider/IncomingRequestHost";
import { AuthFlow } from "@/components/AuthFlow";
import { AppVersionGate } from "@/components/AppVersionGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initSentry } from "@/lib/sentry";
import { useSentryNavigationBreadcrumbs } from "@/lib/useSentryNavigationBreadcrumbs";

// Web-build init. `initSentry` is idempotent + SSR-safe (window guard), so
// this coexists cleanly with the mobile build's own init in main.mobile.tsx.
initSentry();

const queryClient = new QueryClient();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

// The full HTML shell (doctype, <head>, <body>) is provided by the static
// entry files (`index.mobile.html` for the Capacitor SPA build, and the
// marketing/dist HTML for the web build). This root route only renders the
// in-page tree, so no `shellComponent` is declared — nesting an <html>
// element inside <div id="root"> breaks React 19 hydration and results in
// a white screen. Meta/link tags belong in those HTML files.
export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

// `User.role` is added by junior's SVC-82 (provider role gate) and isn't on
// main yet — see notifications.ts for the same defensive read pattern. Once
// SVC-82 merges, this surfaces transparently with no change here.
type UserWithMaybeRole = { role?: "consumer" | "provider" | "admin" };

function AppGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isNewUser } = useAuth();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const isProfileRoute = pathname.startsWith("/profile");
  const isAdminRoute = pathname.startsWith("/admin");
  // Public routes — reachable without login.
  // - SVC-37: legal pages (privacy, terms, refund) are hit anonymously by
  //   Razorpay merchant review, Play Store data-safety review, and App Store
  //   privacy nutrition reviewers. An AuthFlow gate would kill the submission.
  // - SVC-161: /download is the pre-signup landing page — auth would defeat
  //   the point (users haven't installed the app yet).
  // All rendered as full-width layout with no BottomNav.
  const isPublicRoute =
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/refund" ||
    pathname === "/download";
  const role = (user as UserWithMaybeRole | null)?.role ?? null;

  // Wire FCM tap → in-app navigation. No-op on web; lazy-loads the Capacitor
  // plugin so the web bundle stays clean. Must live inside <AuthProvider/> for
  // `useAuth()` access — that's why it sits here, not in main.mobile.tsx.
  useNotificationRouter();

  // SVC-67: obtain a device token and store it against the user, so the
  // backend has somewhere to send. Sits beside the router hook for the same
  // reason — it needs auth state, and this component is shared by the web and
  // Capacitor builds, so both platforms register from one place.
  useFcmRegistration(isAuthenticated);

  // Record every SPA navigation as a Sentry breadcrumb so a subsequent
  // error report carries the last N routes the user visited. Cheap; no-op
  // when Sentry isn't initialized (dev + no-DSN). Placed here rather than
  // in RootComponent so it inherits the same router context every other
  // AppGate hook does.
  useSentryNavigationBreadcrumbs();

  // Public routes render regardless of auth state.
  if (isPublicRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md min-h-screen bg-background relative">
        <AuthFlow onComplete={() => {}} />
      </div>
    );
  }

  // Admin routes (SVC-90 KYC review) require the admin role. Non-admins on
  // /admin/* get bounced home; admins are free to visit any route.
  if (isAdminRoute && role !== "admin") {
    return <Navigate to="/" />;
  }

  // Force setup mode for fresh registrations (is_new_user) or when name is missing.
  // The name check also covers reloads, where the in-memory isNewUser flag resets.
  // Skip for admins — they don't use the consumer onboarding flow.
  if (role !== "admin" && user && (isNewUser || !user.name) && !isProfileRoute) {
    return <Navigate to="/profile" />;
  }

  // Admin pages render full-width; consumer/provider keep the max-w-md mobile shell.
  if (isAdminRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }
  return <div className="mx-auto max-w-md min-h-screen bg-background pb-20">{children}</div>;
}

function RootComponent() {
  // ErrorBoundary sits above the providers so an unhandled render error in
  // any of them (AuthProvider init, QueryClient boot, AppVersionGate mount)
  // still gets caught + reported to Sentry — without this the web/SSR build
  // shows a white screen with nothing in Sentry. The mobile entry
  // (main.mobile.tsx) already has the same wrap; this brings the web path
  // to parity. Route-level errors (inside <Outlet/>) are still handled by
  // TanStack Router's `defaultErrorComponent` (RouterErrorFallback).
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* CartProvider sits inside AuthProvider so the cart can be
              scoped by user id (see cart-context.tsx). Outside the
              version gate so a version-blocked user's cart still
              survives an update. */}
          <CartProvider>
            {/* SplashGate is the outermost UI concern: the animated
                launch splash covers everything for ~2s on cold app
                open, then swaps in the app shell. Sits inside all the
                providers so the app underneath is fully hydrated by
                the time the splash lifts. */}
            <SplashGate>
              {/* SVC-162: version-check nudge/block overlays. Wraps
                  the whole tree so the block state can cover
                  everything below it. */}
              <AppVersionGate>
                <AppGate>
                  <Outlet />
                  <BottomNav />
                  <CartFab />
                </AppGate>
                {/* SVC-69: full-screen overlay for an incoming
                    broadcast job. Sits outside AppGate so it can
                    cover the whole shell; renders nothing unless a
                    booking id is supplied. */}
                <IncomingRequestHost />
                <Toaster />
              </AppVersionGate>
            </SplashGate>
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
