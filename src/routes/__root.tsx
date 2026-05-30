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
import { BottomNav } from "@/components/BottomNav";
import { AuthFlow } from "@/components/AuthFlow";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import appCss from "../styles.css?url";

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
      { title: "ServiceConnect — Home Services at Your Doorstep" },
      {
        name: "description",
        content:
          "Book trusted home services in Bangalore — cleaning, plumbing, electrical, salon & more.",
      },
      { property: "og:title", content: "ServiceConnect — Home Services at Your Doorstep" },
      { property: "og:description", content: "Book trusted home services in Bangalore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      // PWA / iOS home-screen
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "ServiceConnect" },
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

function AppGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isNewUser } = useAuth();
  const routerState = useRouterState();
  const isProfileRoute = routerState.location.pathname.startsWith("/profile");

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md min-h-screen bg-background relative">
        <AuthFlow onComplete={() => {}} />
      </div>
    );
  }

  // Force setup mode for fresh registrations (is_new_user) or when name is missing.
  // The name check also covers reloads, where the in-memory isNewUser flag resets.
  if (user && (isNewUser || !user.name) && !isProfileRoute) {
    return <Navigate to="/profile" />;
  }

  return <div className="mx-auto max-w-md min-h-screen bg-background pb-20">{children}</div>;
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppGate>
          <Outlet />
          <BottomNav />
        </AppGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
