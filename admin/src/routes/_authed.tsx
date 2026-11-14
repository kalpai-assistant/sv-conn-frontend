import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { AdminShell } from "@/components/AdminShell";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { ApiError, getSessionToken } from "@/lib/api";
import { authErrorMessage, loadCurrentAdmin } from "@/lib/auth";
import { canOpen } from "@/lib/nav";

/**
 * Pathless layout for every signed-in screen, so this guard covers every route
 * under _authed/ without touching them (SVC-422).
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    if (!getSessionToken()) {
      throw redirect({ to: "/login" });
    }
    let admin;
    try {
      admin = await loadCurrentAdmin();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: "/login", search: { reason: "session_expired" } });
      }
      // Offline, a 5xx or the IP allowlist: errorComponent. None of them says
      // the session is over, so the token stays.
      throw err;
    }
    if (!canOpen(admin.role, location.pathname)) {
      throw redirect({ to: "/" });
    }
    return { admin };
  },
  pendingComponent: () => (
    <div className="p-8">
      <LoadingState />
    </div>
  ),
  errorComponent: GuardError,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { admin } = Route.useRouteContext();
  return (
    <AdminShell admin={admin}>
      <Outlet />
    </AdminShell>
  );
}

function GuardError({ error }: { error: unknown }) {
  const router = useRouter();
  return <ErrorState message={authErrorMessage(error)} onRetry={() => router.invalidate()} />;
}
