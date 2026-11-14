import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">Page not found.</div>,
});
