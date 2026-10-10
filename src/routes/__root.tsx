import { Outlet, Link, createRootRoute, useRouterState, Navigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { CartProvider } from "@/lib/cart-context";
import { CategorySheetProvider } from "@/lib/category-sheet-context";
import { ServiceSheetProvider } from "@/lib/service-sheet-context";
import { useNotificationRouter } from "@/lib/notifications";
import { useFcmRegistration } from "@/lib/fcm";
import { useAddresses, useProviderProfile } from "@/hooks/useApi";
import { isTeamPro, useProMe } from "@/hooks/usePro";
import { useProHeartbeatHost } from "@/hooks/useProHeartbeat";
import { rememberPendingInvite } from "@/lib/invite";
import { adminGate } from "@/lib/admin";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { consumesLanding, proGateVerdict, skipsLocationGate, type ProState } from "@/lib/pro-gate";
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

  // SVC-322: is this consumer also a Pro? Team Pros sign up as consumers, so
  // the role cannot say; `/pros/me` can. Asked only of consumer-role users —
  // a provider's Pro row is their Pro-for-self, and they stay in the provider
  // app. See `pro-gate.ts` for what the answer decides.
  const isConsumer = isAuthenticated && role !== "provider" && role !== "admin";
  const {
    data: proMe,
    isPending: proMePending,
    isError: proMeError,
  } = useProMe(user?.id, isConsumer);
  const proState: ProState = !isConsumer
    ? "not-pro"
    : proMeError
      ? "error"
      : proMePending
        ? "loading"
        : isTeamPro(proMe)
          ? "pro"
          : "not-pro";
  // SVC-322: someone who opened /invite came to join a team. Remembered for the
  // session, because a new invitee is sent to name setup first and saving it
  // would otherwise drop them on "/" — see `src/lib/invite.ts`.
  const isInviteRoute = pathname === "/invite";
  useEffect(() => {
    if (isInviteRoute) rememberPendingInvite();
  }, [isInviteRoute]);

  // SVC-322: an online team Pro sends their location every 30 s, on whatever
  // screen they are on — so it runs here, not on Pro Home.
  useProHeartbeatHost(isTeamPro(proMe) && proMe.is_online);

  // Which sign-in has had its launch landing in the Pro app. A ref keyed by
  // user rather than a boolean, so signing out and in as someone else lands
  // them afresh.
  const landedFor = useRef<string | null>(null);
  const landed = !!user?.id && landedFor.current === user.id;
  // Whether this render actually reaches the Pro gate in the consumer branch
  // below. The effect runs after *every* render, including the ones that
  // return early — and on device it used up the landing during the blank
  // restoring splash (the token refresh let /pros/me answer before /users/me
  // did), so the Pro was let through to the consumer home. The name-setup
  // redirect to /profile, which also fires on "/", did the same to every new
  // invitee. Mirrors the branch conditions; keep the two in step.
  const needsProfileSetup = !!user && (isNewUser || !user.name) && !isProfileRoute;
  const reachesProGate =
    isConsumer && !isRestoring && !isPublicRoute && !isAdminRoute && !needsProfileSetup;
  useEffect(() => {
    if (user?.id && consumesLanding(pathname, proState, reachesProGate)) {
      landedFor.current = user.id;
    }
  }, [user?.id, pathname, proState, reachesProGate]);

  // Wire push taps → in-app navigation: native taps through the Capacitor
  // plugin (lazy-loaded so the web bundle stays clean), web-push taps through
  // the URL the service worker opens. Must live inside <AuthProvider/> for
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

  // Every branch below carries `safe-top` (SVC-285), and a new one must too.
  //
  // It keeps content out of the iOS status bar and paints the strip brand
  // blue — see the utility in styles.css for why only the iOS PWA needs it and
  // why it is inert everywhere else. Applied here rather than on each screen's
  // header because routes then *inherit* it: the nine sticky headers and the
  // four provider screens that have no header at all are all covered, and a
  // screen added later cannot forget a class it never opts into. Forgetting it
  // is exactly how this bug happened.
  //
  // All five branches need it, including the ones that look like they would
  // not: `isRestoring` renders a bare splash and the unauthenticated branch
  // renders the login flow, both full-height, both against the status bar.

  // Public routes render regardless of auth state.
  if (isPublicRoute) {
    return <div className="safe-top min-h-screen bg-background">{children}</div>;
  }

  // Cold-start session restore — hold the shell blank while AuthProvider
  // probes stored tokens against /users/me. Without this guard, a signed-in
  // user briefly sees the AuthFlow ("Continue with phone") flash before
  // landing on home, which reads as "did I get logged out?". Blank splash
  // is honest — we don't yet know what to render.
  if (isRestoring) {
    return <div className="safe-top mx-auto max-w-md min-h-screen bg-background" />;
  }

  // SVC-345: admin login is its own entry point, handled before the consumer
  // AuthFlow fallback below. An unauthenticated user hitting any other
  // /admin/* route is redirected here (not into AuthFlow — that lands them on
  // the consumer home after signin and never on the admin surface). An
  // already-signed-in admin arriving here hops onto /admin/kyc, so a stale
  // bookmark doesn't force a redundant login screen. /admin/login is the only
  // /admin/* route reachable without auth, kept apart from `isPublicRoute`
  // because it is still role-aware. The rules live in `adminGate` (SVC-329).
  const adminVerdict = adminGate(pathname, isAuthenticated, role);
  if (adminVerdict === "to-kyc") {
    return <Navigate to="/admin/kyc" replace />;
  }
  if (adminVerdict === "login-page") {
    return <div className="safe-top min-h-screen bg-background">{children}</div>;
  }
  if (adminVerdict === "to-login") {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAuthenticated) {
    return (
      <div className="safe-top mx-auto max-w-md min-h-screen bg-background relative">
        <AuthFlow onComplete={() => {}} invite={isInviteRoute} />
      </div>
    );
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
    if (needsProfileSetup) {
      return <Navigate to="/profile" replace />;
    }

    // SVC-322: the Pro app lives inside the consumer role. Before the location
    // gate, deliberately: a Pro is not booking anything, and an invitee with
    // no saved address would otherwise be stopped by a "where are you?" screen
    // before ever reaching their jobs.
    const proVerdict = proGateVerdict({ pathname, proState, landed });
    if (proVerdict === "wait") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (proVerdict === "to-pro") {
      return <Navigate to="/pro" replace />;
    }
    if (proVerdict === "to-home") {
      return <Navigate to="/" replace />;
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
    if (isAuthenticated && !skipsLocationGate(pathname, proState)) {
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
  // The admin menu sits here, once, so every admin page has it (SVC-329); the
  // login page returns earlier and never shows it.
  if (isAdminRoute) {
    return (
      <div className="safe-top min-h-screen bg-background">
        <AdminMenu />
        {children}
      </div>
    );
  }
  return (
    <div className="safe-top mx-auto max-w-md min-h-screen bg-background pb-20">{children}</div>
  );
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
            {/* SVC-290 sheets: CategorySheetProvider hosts the L1 →
                sub-categories picker; ServiceSheetProvider hosts the
                service detail sheet. Both sit above SplashGate so a
                deep-link redirect (either /category/{L1-slug} or
                /service/{id}) can safely open its sheet before the
                splash lifts. */}
            <CategorySheetProvider>
              <ServiceSheetProvider>
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
              </ServiceSheetProvider>
            </CategorySheetProvider>
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
