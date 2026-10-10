/**
 * The admin pages' shared menu (SVC-329). Before it, Bookings, KYC and Payouts
 * were reachable only by typing the URL. Rendered once by AppGate's admin
 * shell, so a page never has to remember to include it.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ADMIN_MENU_ITEMS } from "@/lib/admin";

export function AdminMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Admin" className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-2">
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
      </div>
    </nav>
  );
}
