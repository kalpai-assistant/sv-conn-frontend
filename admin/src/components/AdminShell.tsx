/**
 * The authed layout: sidebar + top bar + content (SVC-421).
 *
 * Desktop-first. From md up the sidebar is a fixed column; below md it hides
 * and the top bar's hamburger opens the same nav in a Sheet. Phones get a
 * readable console, not an optimised one (SVC-407).
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_SECTIONS } from "@/lib/nav";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin sections" className="space-y-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </h2>
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeProps={{
                    className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                  }}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 overflow-y-auto">
            <SheetTitle className="mb-6">EazyServ Admin</SheetTitle>
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <Link to="/" className="font-semibold text-primary">
          EazyServ Admin
        </Link>
        {/* The signed-in admin's email and menu go here with auth (SVC-407 A2). */}
        <span className="ml-auto text-sm text-muted-foreground">Not signed in</span>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r bg-sidebar p-4 md:block">
          <SidebarNav />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
