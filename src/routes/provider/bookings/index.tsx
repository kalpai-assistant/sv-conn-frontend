import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, History, MapPin } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { useBookings, useBookingsTotal } from "@/hooks/useApi";
// Shared with Provider Home (SVC-274). One definition, so a status cannot mean
// one thing on the Jobs page and another on Home.
import { activeStatuses, endedAt, statusStyle, statusText } from "@/lib/job-status";
import type { Booking, BookingStatus } from "@/lib/mock-data";
import { formatRupees } from "@/i18n/format";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/provider/bookings/")({
  component: ProviderBookingsPage,
});

const TABS = ["active", "past"] as const;

// SVC-70 — the provider's list of jobs in flight. Each row opens the job screen,
// which is where the en-route / OTP / complete transitions actually happen.
//
// SVC-296 added the Past tab. Before it, a completed job left the provider's app
// the moment it was finished: this screen kept only the three active statuses,
// so a provider had no record of work they had actually done. The consumer side
// had solved the same problem with an Active/Past pair (src/routes/bookings.tsx)
// and this mirrors it deliberately — same split, same palette — rather than
// inventing a second shape for one app.
//
// Why here and not a fourth nav tab or a Profile row: two nav entries that both
// mean "your jobs" make the provider guess which holds a given job, and Profile
// is where settings live (payout, service area), not a work record.
function ProviderBookingsPage() {
  const { t, lang } = useT("provider");
  const { t: tc } = useT();
  const [tab, setTab] = useState<"active" | "past">("active");
  const { data, isLoading, isError, error } = useBookings();
  const { total, truncated } = useBookingsTotal();
  // Only for the header avatar’s initials.
  const { user } = useAuth();

  const all: Booking[] = data ?? [];
  const active = all.filter((b) => activeStatuses.includes(b.status as BookingStatus));
  // Everything that is not in flight — completed, cancelled, expired. Defined as
  // the complement rather than a list, so a status added later surfaces here
  // instead of vanishing from both tabs.
  const past = all.filter((b) => !activeStatuses.includes(b.status as BookingStatus));
  const jobs = tab === "active" ? active : past;

  return (
    <div className="min-h-screen p-6 pb-24">
      {/* No back arrow, deliberately: this is a tab destination. Tab links use
          `replace` (SVC-230), so there is nothing to pop — an arrow here could
          only navigate to Home, duplicating the Home tab already visible below
          while looking like it undoes something.

          The avatar is the opposite case: Profile left the tab bar, so without
          it here Profile would be reachable only from Home — a regression in
          reach rather than a relocation. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">{t("bookings.title")}</h1>
        <AccountAvatar to="/provider/profile" name={user?.name} />
      </div>

      {/* Same control as the consumer list, so the gesture means the same thing
          on both sides of the app.

          The selected tab is filled with the brand blue rather than a white
          card on grey: the old treatment distinguished the two only by a
          shadow, which on a phone in daylight is close to no signal at all. */}
      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1">
        {TABS.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "active" ? t("bookings.tabActive") : t("bookings.tabPast")}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {tab === "active" ? t("bookings.activeHint") : t("bookings.pastHint")}
      </p>

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {isError && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {errorText(error, t("bookings.loadFailed"), lang)}
        </p>
      )}

      {/* The shared EmptyState rather than a hand-rolled one, so this matches
          the consumer's empty bookings screen by construction — circled icon in
          the brand blue, not a bare grey glyph. The two had drifted: same
          situation, two different treatments.

          No CTA here, unlike the consumer's "Browse services": a provider with
          no jobs needs to go online from Home, which is one tap away in the nav
          below, and the subtitle already says so. */}
      {!isLoading && !isError && jobs.length === 0 && (
        <EmptyState
          icon={tab === "active" ? CalendarDays : History}
          title={tab === "active" ? t("bookings.emptyActiveTitle") : t("bookings.emptyPastTitle")}
          // "the home tab" until SVC-273 — the tab is still there, but naming
          // the screen rather than the control survives the next nav change.
          subtitle={
            tab === "active" ? t("bookings.emptyActiveSubtitle") : t("bookings.emptyPastSubtitle")
          }
        />
      )}

      <div className="mt-6 flex flex-col gap-3">
        {jobs.map((job) => (
          <Link
            key={job.id}
            to="/provider/bookings/$bookingId"
            params={{ bookingId: job.id }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{job.service.name}</p>
              {/* Two jobs for the same service are otherwise indistinguishable here —
                  the address is what tells them apart (SVC-171). Truncated because
                  the full string belongs on the job screen, not in a list row. */}
              {job.address.full && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{job.address.full}</span>
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusStyle[job.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {statusText(job.status, tc)}
                </span>
                {/* The provider's own take, not the customer's price (SVC-296).
                    This row used to render `totalAmount` — ₹499 on a job that
                    pays ₹349 after commission — which is the app telling a
                    provider the wrong number about their own money. Both tabs
                    show payout for the same reason: split across the two, the
                    figure would appear to drop the moment a job finished. */}
                <span className="text-xs font-medium text-foreground">
                  {t("bookings.youEarn", { amount: formatRupees(job.providerPayout, lang) })}
                </span>
                {tab === "past" && (
                  <span className="text-xs text-muted-foreground">{endedAt(job, lang)}</span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Say so rather than present a truncated list as a complete one. The
          server caps a response at 50 rows and this screen does not paginate;
          staying silent would let a provider believe older work no longer
          exists — the very complaint SVC-296 is about. */}
      {truncated && !isLoading && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("bookings.showingRecent", { count: 50, total })}
        </p>
      )}
    </div>
  );
}
