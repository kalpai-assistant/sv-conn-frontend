import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Headset, LayoutGrid, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  to: "/operator" | "/analytics" | "/support";
  label: string;
  icon: typeof LayoutGrid;
};

const NAV: NavItem[] = [
  { to: "/operator", label: "Operator", icon: LayoutGrid },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/support", label: "Support", icon: Headset },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <div className="h-7 w-7 rounded-md bg-primary" aria-hidden />
        <span className="text-base font-semibold">Eazyserv Admin</span>
      </div>

      <nav className="flex-1 space-y-1 p-2" aria-label="Primary">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-2">
        <Button asChild variant="ghost" size="sm" className="w-full justify-start">
          <Link to="/login">
            <LogOut className="size-4" />
            Sign out
          </Link>
        </Button>
      </div>
    </aside>
  );
}
