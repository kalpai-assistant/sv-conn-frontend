import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import { AuthedLayout } from "@/components/authed-layout";
import { LoginPage } from "@/routes/login";
import { AnalyticsPage } from "@/routes/analytics";
import { OperatorPage } from "@/routes/operator";
import { SupportPage } from "@/routes/support";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const authedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  component: AuthedLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/operator" });
  },
});

const operatorRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/operator",
  component: OperatorPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/analytics",
  component: AnalyticsPage,
});

const supportRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/support",
  component: SupportPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayoutRoute.addChildren([indexRoute, operatorRoute, analyticsRoute, supportRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
