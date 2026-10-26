import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, History, MapPin } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { PRO_JOBS_PER_PAGE, useProJobs } from "@/hooks/usePro";
import { dueIn, endedAt, statusStyle, statusText } from "@/lib/job-status";
import { useT } from "@/i18n/LanguageProvider";
import { errorText } from "@/i18n/errors";
import { formatNumber } from "@/i18n/format";

export const Route = createFileRoute("/pro/jobs/")({
  component: ProJobsPage,
});

// SVC-322 — the Pro's jobs, Active and Past. Same control and palette as the
// provider's Jobs screen (src/routes/provider/bookings/index.tsx), so the two
// apps read alike.
//
// Unlike that screen, each tab is its own request: `/pros/me/jobs` splits by
// `scope` on the server, and the Pro's list is short. No payout on the rows —
// a team Pro's pay goes to their SP, and per-Pro earnings is SVC-323.
/** Tab ids, not copy: the labels come from `jobs.tabActive` / `jobs.tabPast`. */
const TABS = ["active", "past"] as const;

function ProJobsPage() {
  const [tab, setTab] = useState<"active" | "past">("active");
  const { data, isLoading, isError, error } = useProJobs(tab);
  const { user } = useAuth();
  const jobs = data?.jobs ?? [];
  const { t, lang } = useT("pro");
  const { t: tc } = useT();

  return (
    <div className="min-h-screen p-6 pb-24">
      {/* No back arrow: this is a tab destination (see the provider Jobs
          screen). The avatar keeps Profile reachable from every tab. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">{t("jobs.title")}</h1>
        <AccountAvatar to="/profile" name={user?.name} />
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1">
        {TABS.map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            aria-pressed={tab === name}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === name
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {name === "active" ? t("jobs.tabActive") : t("jobs.tabPast")}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {tab === "active" ? t("jobs.activeHint") : t("jobs.pastHint")}
      </p>

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {isError && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {errorText(error, t("jobs.loadFailed"), lang)}
        </p>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <EmptyState
          icon={
            tab === "active" ? (
              <CalendarDays aria-hidden="true" className="size-8" />
            ) : (
              <History aria-hidden="true" className="size-8" />
            )
          }
          title={tab === "active" ? t("jobs.emptyActiveTitle") : t("jobs.emptyPastTitle")}
          description={
            tab === "active" ? t("jobs.emptyActiveSubtitle") : t("jobs.emptyPastSubtitle")
          }
        />
      )}

      <div className="mt-6 flex flex-col gap-3">
        {jobs.map((job) => (
          <Link
            key={job.id}
            to="/pro/jobs/$bookingId"
            params={{ bookingId: job.id }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{job.service.name}</p>
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
                  {statusText(job.status, tc, { pro: true })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tab === "past" ? endedAt(job, lang) : dueIn(job, undefined, tc, lang)}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {data && data.total > PRO_JOBS_PER_PAGE && !isLoading && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("jobs.showingRecent", {
            count: formatNumber(PRO_JOBS_PER_PAGE, lang),
            total: formatNumber(data.total, lang),
          })}
        </p>
      )}
    </div>
  );
}
