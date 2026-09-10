import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Clock, User, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { isBottomNavHidden } from "@/lib/nav-visibility";

// Consumer-only, since SVC-273. The provider app used to carry a matching
// four-tab set (home / jobs / earnings / profile); it was removed because
// provider Home became the single entry point — jobs and earnings are
// sections on it, and Profile is reached from the header avatar.
//
// Consumers keep tabs: they browse laterally across five destinations with no
// natural hierarchy between them. A provider's screens are the opposite —
// Home is the job, and everything else is somewhere you go and come back
// from. Tabs would be four ways to leave one screen.
//
// Cart is a consumer tab only — providers never had one.
const consumerTabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: CalendarDays, label: "Bookings" },
  { to: "/cart", icon: ShoppingCart, label: "Cart" },
  { to: "/activity", icon: Clock, label: "Activity" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  // Safe for providers too: BottomNav renders inside CartProvider, and a
  // provider's cart is simply always empty.
  const { totalQuantity } = useCart();

  // Which routes have no nav lives in one shared module — see the drift
  // history in `nav-visibility.ts`.
  if (isBottomNavHidden(location.pathname)) {
    return null;
  }

  // SVC-273: providers have no bottom nav at all. Checked on the role rather
  // than the pathname because the role is what decides — a provider is never
  // meant to see consumer tabs, and the role guard in __root.tsx already keeps
  // them off consumer routes.
  if (user?.role === "provider") {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {consumerTabs.map(({ to, icon: Icon, label }) => {
          // Home matches exactly; every other tab matches by prefix, so a
          // nested path like /bookings/xyz keeps its own tab lit rather than
          // Home. (This also tested `/provider` until SVC-273 removed the
          // provider tabs — there is no second root left to special-case.)
          const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          const cartCount = to === "/cart" ? totalQuantity : 0;
          return (
            <Link
              key={to}
              to={to}
              // Tabs are lateral movement, not depth. Pushing let Home↔Bookings
              // taps stack up, so back walked the pile and read as a two-page
              // loop (SVC-230).
              replace
              className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              aria-label={
                cartCount > 0
                  ? `${label}, ${cartCount} ${cartCount === 1 ? "item" : "items"}`
                  : undefined
              }
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {cartCount > 0 && (
                  // Count, not a bare dot: "how many" is the question a user
                  // actually has, and the badge is the only cart signal on the
                  // tab routes now that CartFab has stepped back to /service/*.
                  // Capped so a runaway quantity can't widen the tab and shove
                  // its neighbours out of line.
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground"
                  >
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
