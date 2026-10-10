/**
 * The admin pages' shared menu (SVC-329). Before it, Bookings, KYC and Payouts
 * were reachable only by typing the URL. Rendered once by AppGate's admin
 * shell, so a page never has to remember to include it.
 *
 * It also holds the admin's only Log out. AppGate keeps a signed-in admin on
 * /admin/*, so Profile's LogoutButton is out of reach — the same stranding
 * SVC-269 fixed for providers. It calls the same `logout()` (tokens + push
 * registration, SVC-164/165) but lands on /admin/login, not the customer
 * sign-in at "/". No going-offline step: an admin has no online flag.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_MENU_ITEMS } from "@/lib/admin";
import { useAuth } from "@/lib/auth-context";

export function AdminMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { logout } = useAuth();

  const signOut = () => {
    logout();
    // Replace: Back after signing out must not return to an admin page.
    navigate({ to: "/admin/login", replace: true });
  };

  return (
    <nav aria-label="Admin" className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
        {ADMIN_MENU_ITEMS.map((item) => {
          // Prefix match so an owner's page (/admin/teams/<id>) lights up Teams.
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Button
              key={item.to}
              asChild
              size="sm"
              // Same selected look as My Bookings' Active / Past tabs.
              variant={active ? "default" : "ghost"}
              className={
                active
                  ? "bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              <Link to={item.to} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </Button>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-1 h-4 w-4" aria-hidden="true" />
          Log out
        </Button>
      </div>
    </nav>
  );
}
