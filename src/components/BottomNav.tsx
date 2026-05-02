import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Clock, User } from "lucide-react";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: CalendarDays, label: "Bookings" },
  { to: "/activity", icon: Clock, label: "Activity" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export function BottomNav() {
  const location = useLocation();

  // Hide on auth, tracking, and service detail screens
  if (
    location.pathname.startsWith("/tracking") ||
    location.pathname.startsWith("/service/")
  ) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {tabs.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
