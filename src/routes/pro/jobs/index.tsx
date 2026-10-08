import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, History, MapPin } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { PRO_JOBS_PER_PAGE, useProJobs } from "@/hooks/usePro";
import { dueIn, endedAt, statusLabel, statusStyle } from "@/lib/job-status";

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
function ProJobsPage() {
  const [tab, setTab] = useState<"active" | "past">("active");
  const { data, isLoading, isError, error } = useProJobs(tab);
  const { user } = useAuth();
  const jobs = data?.jobs ?? [];

  return (
    <div className="min-h-screen p-6 pb-24">
      {/* No back arrow: this is a tab destination (see the provider Jobs
          screen). The avatar keeps Profile reachable from every tab. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Your jobs</h1>
        <AccountAvatar to="/profile" name={user?.name} />
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1">
        {(["active", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {tab === "active"
          ? "Jobs your team has given you that aren’t finished yet."
          : "Jobs you’ve finished, and ones that were cancelled."}
      </p>

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {isError && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Couldn’t load your jobs."}
        </p>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <EmptyState
          icon={tab === "active" ? CalendarDays : History}
          title={tab === "active" ? "No jobs right now" : "No past jobs yet"}
          subtitle={
            tab === "active"
              ? "Stay online from Home. When your team gives you a job, it shows up here."
              : "Jobs you finish will be listed here."
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
                  {statusLabel[job.status] ?? job.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tab === "past" ? endedAt(job) : dueIn(job)}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {data && data.total > PRO_JOBS_PER_PAGE && !isLoading && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Showing your {PRO_JOBS_PER_PAGE} most recent jobs of {data.total}.
        </p>
      )}
    </div>
  );
}
