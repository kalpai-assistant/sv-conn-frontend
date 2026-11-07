/**
 * The authed layout: sidebar + top bar + content (SVC-421).
 *
 * Desktop-first. From md up the sidebar is a fixed column; below md it hides
 * and the top bar's hamburger opens the same nav in a Sheet. Phones get a
 * readable console, not an optimised one (SVC-407).
 */
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOut, type AdminRole, type AdminUser } from "@/lib/auth";
import { KYC_PENDING_COUNT_PATH } from "@/lib/kyc";
import { KycBadgeProvider } from "@/lib/kyc-badge";
import { sectionsFor } from "@/lib/nav";
import { useApiGet } from "@/lib/use-api-get";

function SidebarNav({
  role,
  kycPending,
  onNavigate,
}: {
  role: AdminRole;
  kycPending: number;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Admin sections" className="space-y-6">
      {sectionsFor(role).map((section) => (
        <div key={section.title}>
          <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </h2>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const pending = item.to === "/operator/kyc" ? kycPending : 0;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    aria-label={pending > 0 ? `${item.label}, ${pending} pending` : undefined}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeProps={{
                      className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {pending > 0 && (
                      <span
                        aria-hidden="true"
                        className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-medium tabular-nums text-primary-foreground"
                      >
                        {pending}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ admin, children }: { admin: AdminUser; children: ReactNode }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // All 3 roles can read this. It hides at 0 and on an error, and the queue page
  // is what says a load failed.
  const kycCount = useApiGet<{ count: number }>(KYC_PENDING_COUNT_PATH);
  const kycPending = kycCount.status === "ready" ? kycCount.data.count : 0;

  async function handleSignOut() {
    setSigningOut(true);
    const confirmed = await signOut();
    await navigate({
      to: "/login",
      search: confirmed ? {} : { reason: "logout_unconfirmed" },
      replace: true,
    });
  }

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
            <SidebarNav
              role={admin.role}
              kycPending={kycPending}
              onNavigate={() => setMenuOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <Link to="/" className="shrink-0 font-semibold text-primary">
          EazyServ Admin
        </Link>
        <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground">
          {admin.email}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          <LogOut />
          Sign out
        </Button>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r bg-sidebar p-4 md:block">
          <SidebarNav role={admin.role} kycPending={kycPending} />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <KycBadgeProvider value={kycCount.refresh}>{children}</KycBadgeProvider>
        </main>
      </div>
    </div>
  );
}
