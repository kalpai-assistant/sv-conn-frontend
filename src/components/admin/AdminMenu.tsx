/**
 * The admin pages' shared menu (SVC-329). Before it, Bookings, KYC and Payouts
 * were reachable only by typing the URL. Rendered once by AppGate's admin
 * shell, so a page never has to remember to include it.
 *
 * Log out used to sit here too, until /admin/profile gave it a home (SVC-355);
 * it wrapped this row onto a second line on a phone.
 *
 * Five items need 336px at text-xs with px-3, and a 340px phone has 308 inside
 * the gutter, so items are px-2 under sm (296px). A narrower phone scrolls the
 * row sideways rather than wrapping it, and the current item is scrolled into
 * view so Profile, the last one, is never selected off-screen.
 */
import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ADMIN_MENU_ITEMS } from "@/lib/admin";

export function AdminMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = rowRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    // `block: "nearest"` so this only ever moves the row, never the page.
    // Optional call: jsdom has no scrollIntoView.
    current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="Admin" className="border-b border-border bg-card">
      <div
        ref={rowRef}
        className="mx-auto flex max-w-6xl flex-nowrap items-center gap-1 overflow-x-auto px-4 py-2"
      >
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
              className={`px-2 sm:px-3 ${
                active
                  ? "bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "text-muted-foreground hover:text-foreground"
              }`}
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
