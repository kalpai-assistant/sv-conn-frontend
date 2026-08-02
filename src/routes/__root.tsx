import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
  Navigate,
} from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useNotificationRouter } from "@/lib/notifications";
import { BottomNav } from "@/components/BottomNav";
import { AuthFlow } from "@/components/AuthFlow";
import { AppVersionGate } from "@/components/AppVersionGate";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initSentry } from "@/lib/sentry";

import appCss from "../styles.css?url";

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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "Eazyserv — Home Services at Your Doorstep" },
      {
        name: "description",
        content:
          "Book trusted home services in Bangalore — cleaning, plumbing, electrical, salon & more.",
      },
      { property: "og:title", content: "Eazyserv — Home Services at Your Doorstep" },
      { property: "og:description", content: "Book trusted home services in Bangalore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      // PWA / iOS home-screen
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Eazyserv" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      // Theme colour shown in browser chrome and on Android task switcher
      { name: "theme-color", content: "#7C3AED" },
      { name: "msapplication-TileColor", content: "#7C3AED" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      // Apple touch icon (shown when user adds to iOS home screen)
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      // PWA manifest (also auto-injected by vite-plugin-pwa in production builds)
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <Scripts />
      </body>
    </html>
  );
}

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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* SVC-162: version-check nudge/block overlays. Wraps the whole
            tree so the block state can cover everything below it. */}
        <AppVersionGate>
          <AppGate>
            <Outlet />
            <BottomNav />
          </AppGate>
          <Toaster />
        </AppVersionGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
