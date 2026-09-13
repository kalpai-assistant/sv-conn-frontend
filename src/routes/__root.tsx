import { Outlet, Link, createRootRoute, useRouterState, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { CartProvider } from "@/lib/cart-context";
import { CategorySheetProvider } from "@/lib/category-sheet-context";
import { useNotificationRouter } from "@/lib/notifications";
import { useFcmRegistration } from "@/lib/fcm";
import { useAddresses, useProviderProfile } from "@/hooks/useApi";
import { BottomNav } from "@/components/BottomNav";
import { CartFab } from "@/components/cart/CartFab";
import { SplashGate } from "@/components/SplashGate";
import { IncomingRequestHost } from "@/components/provider/IncomingRequestHost";
import { AuthFlow } from "@/components/AuthFlow";
import { ConsumerLocationGate, ProviderLocationGate } from "@/components/LocationGateHost";
import { useLocationConfirmed } from "@/hooks/useLocationConfirmed";
import { useLocationAvailability } from "@/hooks/useLocationAvailability";
import { shouldGateLocation } from "@/lib/should-gate-location";
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

function AppGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isNewUser, isRestoring } = useAuth();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const isProfileRoute = pathname.startsWith("/profile");
  const isAdminRoute = pathname.startsWith("/admin");
  const isProviderRoute = pathname.startsWith("/provider");
  const isProviderOnboardingRoute = pathname.startsWith("/provider/onboarding");
  // The gate sends providers here for the full map + radius picker, so it must
  // not then block that route.
  const isProviderLocationRoute = pathname.startsWith("/provider/location");
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
  const role = user?.role ?? null;
  const isProvider = isAuthenticated && role === "provider";

  // Only fetch the provider profile (drives the onboarding gate below) once
  // we know they're actually a provider — otherwise every consumer would fire
  // an extra API call at boot.
  const { data: providerProfile, isLoading: providerProfileLoading } =
    useProviderProfile(isProvider);

  // Subscribed, not read: a plain module read would not re-render when the user
  // answers, leaving the gate on screen forever. See useLocationConfirmed.
  const locationConfirmed = useLocationConfirmed();

  // SVC-281: can we locate them at all? The gate appears only when the answer
  // is no.
  //
  // Held until authenticated. This component mounts at launch, with the user
  // still on the login screen, and the hook resolves once and keeps its answer
  // — so probing here meant probing before the session existed, then showing a
  // stale "cannot locate" gate to someone whose location worked fine.
  const availability = useLocationAvailability(isAuthenticated);

  // Only to answer "do they have *any* saved address" — a consumer with none
  // cannot book, so the gate is how they get one. Gated on being a
  // non-provider so providers and logged-out visitors don't fire the call.
  const {
    data: addresses,
    isPending: addressesPending,
    isError: addressesError,
  } = useAddresses(isAuthenticated && !isProvider);

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

  // Cold-start session restore — hold the shell blank while AuthProvider
  // probes stored tokens against /users/me. Without this guard, a signed-in
  // user briefly sees the AuthFlow ("Continue with phone") flash before
  // landing on home, which reads as "did I get logged out?". Blank splash
  // is honest — we don't yet know what to render.
  if (isRestoring) {
    return <div className="mx-auto max-w-md min-h-screen bg-background" />;
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
    return <Navigate to="/" replace />;
  }

  // Role-based landing (SVC-41). Providers live under /provider/*; consumers
  // live everywhere else. Bouncing here means push-tap navigation from
  // notifications lands cleanly on the right surface even if the URL was
  // constructed for the wrong role.
  //
  // Every redirect in this guard is `replace` (SVC-273). These are corrections,
  // not navigation: the route the user was on was wrong for who they are, so it
  // must not become somewhere "back" can return to.
  //
  // Found on device: without it, a provider launching the app went "/" →
  // /provider and that left a history entry. `history.length` was 2 on a clean
  // launch, so back popped the entry, this guard immediately redirected again,
  // and the provider stayed put — the double-tap-to-exit branch in
  // main.mobile.tsx was unreachable, and the app could not be exited with the
  // back button at all.
  if (role === "provider") {
    if (!isProviderRoute) {
      return <Navigate to="/provider" replace />;
    }
    // Force incomplete providers through onboarding — name missing OR KYC
    // still pending (not submitted). Once KYC is submitted/verified/rejected
    // they're free to roam the provider surface.
    if (!isProviderOnboardingRoute) {
      // Deliberately not waiting on the location probe (SVC-281). That call
      // can take seconds — it is what raises the native permission dialog —
      // and holding the app blank for it was a worse bug than the flicker it
      // was meant to prevent. The gate simply appears late if it appears.
      if (providerProfileLoading) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        );
      }
      const incomplete = !user?.name || providerProfile?.kyc_status === "pending";
      if (incomplete) {
        return <Navigate to="/provider/onboarding" replace />;
      }

      // SVC-281: ask about the service area only when something is actually
      // wrong — either we cannot locate them, or they have no area at all.
      //
      // This used to fire on every launch. A service area is a standing
      // setting, not a daily decision: a provider whose area is Karve Nagar
      // has that area whether the app is open or not, and re-asking daily was
      // pure friction that also invited a mis-tap moving their geo-fence.
      //
      // The null-area clause is not optional and is *not* about location being
      // unavailable. No `service_area_center` means the PostGIS dispatch query
      // excludes them from every broadcast — online, verified, subscribed, and
      // receiving nothing, permanently, with nothing on screen explaining why.
      // That is a worse failure than a stale centre, so it gates regardless of
      // whether we can locate them.
      //
      // After onboarding on purpose — the wizard already asks (SVC-257), and
      // asking again inside it would be the same question twice.
      const providerVerdict = shouldGateLocation({
        confirmed: locationConfirmed,
        blocked: availability.isResolving ? null : availability.blocked,
        hasOwnLocation: providerProfile?.service_area_lat != null,
      });
      if (!isProviderLocationRoute && providerVerdict === "gate") {
        return (
          <ProviderLocationGate
            lat={providerProfile?.service_area_lat ?? null}
            lng={providerProfile?.service_area_lng ?? null}
            radiusKm={providerProfile?.service_area_radius_km ?? 10}
            reason={availability.reason}
          />
        );
      }
    }
  } else if (role !== "admin") {
    // Consumer path — bounce them out of /provider/*, force through profile
    // setup for fresh registrations (name missing).
    if (isProviderRoute) {
      return <Navigate to="/" replace />;
    }
    if (user && (isNewUser || !user.name) && !isProfileRoute) {
      return <Navigate to="/profile" replace />;
    }

    // SVC-281: ask for a location only when we cannot determine one.
    //
    // This used to fire on every launch, on the theory that the costly failure
    // is a *stale* address rather than a missing one. The stale case is real —
    // someone in Pune yesterday and Mumbai today books against their Pune
    // address and the booking dies as "no partners found nearby" — but asking
    // everyone daily does not reliably catch it: a daily prompt becomes a
    // reflex, and a reflex cannot notice the city is wrong.
    //
    // So the gate now appears only when we genuinely do not know where they
    // are, or they have no address to book against at all.
    if (isAuthenticated) {
      const verdict = shouldGateLocation({
        confirmed: locationConfirmed,
        blocked: availability.isResolving ? null : availability.blocked,
        // A failed fetch resolves to `false`, not `null`. Leaving it null on
        // error would spin forever once React Query gives up retrying — the
        // same lockout shape as #121, and offline is exactly when it happens.
        // Gating instead is safe: the gate's manual entry needs no network.
        hasOwnLocation: addressesError ? false : addressesPending ? null : !!addresses?.length,
      });
      // Only the address query is worth a spinner — it is one fast request.
      // The location probe is not: it can take seconds, since it is the call
      // that raises the native permission dialog, and blocking on it would
      // mean a blank launch for everyone. So the app renders while it runs and
      // the gate appears only once the answer comes back negative.
      if (verdict === "wait" && addressesPending && !addressesError) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        );
      }
      if (verdict === "gate") {
        return <ConsumerLocationGate reason={availability.reason} />;
      }
    }
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
            {/* CategorySheetProvider (SVC-290) hosts the L1 → services picker
                sheet. Above SplashGate so a `/category/{L1-slug}` deep-link
                redirect can safely open the sheet even before the splash
                lifts. */}
            <CategorySheetProvider>
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
            </CategorySheetProvider>
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
