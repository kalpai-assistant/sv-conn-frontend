/**
 * Admin dashboard — landing page at `/admin` (SVC-346).
 *
 * Three count cards, one per surface the admin actually works. Each is a
 * clickable Link to the sub-page it summarises; the counts are read from the
 * same hooks the sub-pages use, so react-query shares cache keys and the
 * dashboard warms up a surface the admin is about to open.
 *
 * No real-time updates — react-query's refetchOnWindowFocus (default) is
 * enough for a surface the admin flips to between actions.
 *
 * ## Scope caveats on the counts
 *
 * - **KYC pending**: exact — the queue endpoint returns every submitted row.
 * - **Payouts owed**: the backend caps the pending-settlements list at 200
 *   providers; the response's `total` field carries the true count and is
 *   what we render. The `pending_payout_paise` sum here therefore sums the
 *   top-200 only (shortfall is noted on-card when `truncated`).
 * - **Bookings today**: the admin bookings endpoint has no date filter yet —
 *   we fetch page 1 at 50 rows and client-filter to today. For beta scale
 *   (dozens of bookings/day) this is accurate; above that it will undercount
 *   and the card needs a backend date filter. Flagged with a `// TODO`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, IndianRupee, Loader2, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { formatPaise } from "@/lib/currency";
import { useAdminBookings, useKYCQueue, usePendingSettlements } from "@/hooks/useApi";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Pick a surface. Counts refresh when you focus the tab.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KycCard />
          <PayoutsCard />
          <BookingsTodayCard />
        </div>
      </div>
    </AdminShell>
  );
}

function KycCard() {
  const { data, isLoading, isError } = useKYCQueue("submitted");
  const count = data?.length ?? 0;
  return (
    <DashboardCard
      to="/admin/kyc"
      icon={ShieldCheck}
      title="KYC pending"
      subtitle="Providers waiting on review"
      value={count}
      valueSuffix={count === 1 ? "submission" : "submissions"}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

function PayoutsCard() {
  const { data, isLoading, isError } = usePendingSettlements();
  // `data.total` carries the true provider count when the server list is
  // capped at 200 (see API_PendingSettlementsResponse). Prefer it over
  // providers.length so the card doesn't under-report during a backlog.
  const providers = data?.providers ?? [];
  const providerCount = data?.total ?? providers.length;
  const owedPaise = providers.reduce((acc, p) => acc + p.pending_payout_paise, 0);
  const truncated = data?.truncated ?? false;

  return (
    <DashboardCard
      to="/admin/payouts"
      icon={IndianRupee}
      title="Payouts owed"
      subtitle={
        truncated
          ? `${formatPaise(owedPaise)} across top 200 (list capped)`
          : `${formatPaise(owedPaise)} across pending providers`
      }
      value={providerCount}
      valueSuffix={providerCount === 1 ? "provider" : "providers"}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

// Today = local-midnight cutoff, same convention as admin.bookings.tsx
// `rangeCutoffMs("today")`. Admin + beta both operate in one timezone so a
// server-side range isn't worth the backend trip yet.
function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function BookingsTodayCard() {
  // TODO: narrow to today server-side once useAdminBookings grows a date
  // filter (SVC-299 shipped without one). Until then we fetch page 1 and
  // filter client-side — accurate at beta scale, undercounts past 50/day.
  const { data, isLoading, isError } = useAdminBookings({
    status: "all",
    disputed: false,
    page: 1,
    perPage: 50,
  });
  const cutoff = startOfTodayMs();
  const rows = data?.bookings ?? [];
  const todayCount = rows.filter((b) => new Date(b.created_at).getTime() >= cutoff).length;

  return (
    <DashboardCard
      to="/admin/bookings"
      icon={ClipboardList}
      title="Bookings today"
      subtitle="Created since midnight (local)"
      value={todayCount}
      valueSuffix={todayCount === 1 ? "booking" : "bookings"}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

function DashboardCard({
  to,
  icon: Icon,
  title,
  subtitle,
  value,
  valueSuffix,
  isLoading,
  isError,
}: {
  to: "/admin/kyc" | "/admin/payouts" | "/admin/bookings";
  icon: LucideIcon;
  title: string;
  subtitle: string;
  value: number;
  valueSuffix: string;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/60 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <ArrowRight
          className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
          aria-hidden="true"
        />
      </div>

      <div className="flex items-baseline gap-2">
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : isError ? (
          // The sub-page shows the real error with a Try again button; the
          // dashboard just has to communicate "couldn't load" without
          // pretending the number is zero. Clicking the card still takes the
          // admin to the page where they can retry.
          <span className="text-sm text-destructive">Couldn't load</span>
        ) : (
          <>
            <span className="text-3xl font-semibold text-foreground tabular-nums">{value}</span>
            <span className="text-sm text-muted-foreground">{valueSuffix}</span>
          </>
        )}
      </div>
    </Link>
  );
}
