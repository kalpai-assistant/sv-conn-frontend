/**
 * Admin shell — top nav + logout, wrapping the admin surface pages (SVC-346).
 *
 * The admin surface (KYC / Payouts / Bookings / dashboard) needs cross-nav
 * and a sign-out control that neither the consumer nor provider shells
 * provide, and that the __root.tsx AppGate deliberately strips (max-w-md +
 * BottomNav don't belong here).
 *
 * ## Why a wrapping component, not a TanStack layout route
 *
 * TanStack Router's flat/dot file-based routing is the convention in this
 * codebase — provider/* has no layout file either (see src/routes/provider/).
 * A layout route at `admin.tsx` would also auto-wrap `/admin/login`, which
 * must stay bare because the user isn't an admin yet when they hit it. An
 * explicit component import at each admin page is lighter touch, keeps the
 * routing shape unchanged, and makes "this page lives inside the shell"
 * opt-in rather than magical.
 *
 * ## Logout target override
 *
 * `LogoutButton` defaults to `/`, which lands an ex-admin on the consumer
 * AuthFlow. We pass `redirectTo="/admin/login"` so sign-out stays within the
 * admin entry point.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { LogoutButton } from "@/components/LogoutButton";

/** Pages that live inside the shell. Order drives nav order. */
const NAV_ITEMS = [
  { to: "/admin/kyc", label: "KYC" },
  { to: "/admin/payouts", label: "Payouts" },
  { to: "/admin/bookings", label: "Bookings" },
] as const;

/** Initials fallback for the identity badge when the admin has no name on file
 *  — early admin rows are created from scripts/create_admin.py with just a
 *  phone, so `user.name` can be null. Returns at most two uppercase chars. */
function initials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return phone.slice(-2);
    const first = parts[0][0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  return phone.slice(-2);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const label = user?.name ?? user?.phone ?? "Admin";
  const initialsText = user ? initials(user.name, user.phone) : "A";

  return (
    <div className="flex min-h-screen flex-col">
      <AdminNav identityLabel={label} initialsText={initialsText} />
      <main className="flex-1">{children}</main>
    </div>
  );
}

function AdminNav({
  identityLabel,
  initialsText,
}: {
  identityLabel: string;
  initialsText: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        {/* Left: wordmark. Links to the dashboard so clicking the brand lands
            the admin on the overview, mirroring how most SaaS consoles behave. */}
        <Link
          to="/admin"
          className="flex items-center gap-2"
          aria-label="EazyServ admin — go to dashboard"
        >
          <img src="/eazyserv-mark.svg" alt="" className="h-6 w-auto" aria-hidden="true" />
          <span className="hidden text-sm font-semibold text-foreground sm:inline">EazyServ</span>
          <span className="hidden rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
            Admin
          </span>
        </Link>

        {/* Middle: section links. TanStack Router's activeProps handles the
            trailing-slash / query-param edge cases that reading pathname by
            hand would miss. */}
        <nav className="flex items-center gap-1" aria-label="Admin sections">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{
                className:
                  "rounded-md px-3 py-1.5 text-sm font-semibold bg-primary/10 text-primary",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right: identity badge + logout. Flex-grow + margin-auto so the right
            cluster hugs the edge regardless of middle-nav width. */}
        <div className="ml-auto flex items-center gap-3">
          <span
            className="flex items-center gap-2 text-sm text-muted-foreground"
            title={identityLabel}
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {initialsText}
            </span>
            <span className="hidden max-w-[12rem] truncate md:inline">{identityLabel}</span>
          </span>
          {/* Compact wrapper: LogoutButton renders `w-full` + `p-3 rounded-xl`
              — sized for a profile-card button. The nav row is 56 px tall and
              only needs enough width for "Logout" + icon, so clamp with a
              fit-content wrapper. The inner button still renders at its own
              padding; `w-full` resolves against the fit-content parent. */}
          <div className="w-fit">
            <LogoutButton redirectTo="/admin/login" />
          </div>
        </div>
      </div>
    </header>
  );
}
