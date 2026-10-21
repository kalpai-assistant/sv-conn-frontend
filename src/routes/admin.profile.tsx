/**
 * Admin profile (SVC-355): who is signed in, and the admin's Log out.
 *
 * AppGate keeps a signed-in admin on /admin/* (SVC-329), so the customer and
 * provider Profile screens are out of reach. Log out lived in the admin menu
 * until this page existed, where it wrapped the menu onto a second row on a
 * phone. Here it sits where the other two personas find theirs.
 *
 * Not `LogoutButton`: that lands on the customer sign-in at "/" and carries
 * the provider's go-offline step. This calls the same `logout()` (tokens +
 * push registration, SVC-164/165) and lands on /admin/login. No confirm step:
 * LogoutButton only asks a provider who is online, and an admin has no online
 * flag, so like a consumer they sign out in one tap.
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { initialsFrom } from "@/lib/initials";
import { displayVersion } from "@/lib/version";

export const Route = createFileRoute("/admin/profile")({
  component: AdminProfilePage,
});

function AdminProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const initials = initialsFrom(user?.name);

  const signOut = () => {
    logout();
    // Replace: Back after signing out must not return to an admin page.
    navigate({ to: "/admin/login", replace: true });
  };

  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Profile</h1>

      <div className="mt-4 flex items-center gap-4 rounded-lg border border-border p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
          {initials ?? <UserRound className="h-7 w-7" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          {/* An admin account can be created with no name; the phone is what
              identifies it, so the gap is said rather than left blank. */}
          {user?.name ? (
            <h2 className="truncate text-base font-semibold text-foreground">{user.name}</h2>
          ) : (
            <h2 className="text-base font-medium text-muted-foreground">No name on file</h2>
          )}
          <p className="text-sm tabular-nums text-muted-foreground">{user?.phone}</p>
          <Badge variant="secondary" className="mt-1">
            Admin
          </Badge>
        </div>
      </div>

      {/* Same look as LogoutButton on the customer and provider profiles. */}
      <div className="mt-8">
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive p-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>

      <p className="pb-6 pt-4 text-center text-[10px] text-muted-foreground">
        EazyServ · v{displayVersion()}
      </p>
    </div>
  );
}
