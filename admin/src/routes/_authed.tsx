import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/AdminShell";

/**
 * Pathless layout for every signed-in screen. There is no guard yet: SVC-407
 * A2 adds the auth check here as a `beforeLoad`, so every route under
 * _authed/ is covered without touching it.
 */
export const Route = createFileRoute("/_authed")({
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
