import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Clock, User, IndianRupee, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { isBottomNavHidden } from "@/lib/nav-visibility";

// Two tab sets — the app is single-APK, role-gated (SVC-41). Selected in the
// render based on user.role. Cart is a consumer tab only; providers have no
// cart.
const consumerTabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: CalendarDays, label: "Bookings" },
  { to: "/cart", icon: ShoppingCart, label: "Cart" },
  { to: "/activity", icon: Clock, label: "Activity" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

// Three, not four: Profile moved to the Home header avatar in SVC-273.
//
// It was the least-visited of the four and held a quarter of the most
// valuable area on the screen — the same reasoning Blinkit and Zepto follow,
// where the account entry point sits in the top corner and the bar carries
// only the destinations people move between.
//
// The consumer set keeps its Profile tab on purpose: a consumer's Profile
// holds addresses, which are reached mid-booking, so it is genuinely a
// frequent destination there.
const providerTabs = [
  { to: "/provider", icon: Home, label: "Home" },
  { to: "/provider/bookings", icon: CalendarDays, label: "Jobs" },
  { to: "/provider/earnings", icon: IndianRupee, label: "Earnings" },
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

  const tabs = user?.role === "provider" ? providerTabs : consumerTabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {tabs.map(({ to, icon: Icon, label }) => {
          // "/" and "/provider" are both home-tab roots — match them
          // exactly so nested paths don't keep the Home tab lit while
          // the user is on e.g. /provider/bookings/xyz. Non-home tabs
          // match by prefix.
          const isHome = to === "/" || to === "/provider";
          const active = isHome ? location.pathname === to : location.pathname.startsWith(to);
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
