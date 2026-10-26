/**
 * The work a provider has in hand, on Home (SVC-274).
 *
 * ## Why Home, when there is a Jobs tab
 *
 * Providers do not browse to a job. A push tap goes straight to the job screen
 * (`routeForPayload` → `/provider/bookings/{id}`); every other session starts
 * at Home. So Home is the landing surface, not an alternative route to the same
 * place, and until now it showed a readiness checklist confirming they are
 * eligible for work they already have.
 *
 * ## Why one card and a queue, rather than a list
 *
 * The statuses are a pipeline, not categories. A provider who is IN_PROGRESS on
 * one job and ACCEPTED on two others has exactly one thing to do, and the screen
 * already knows which — `currentJob` picks the furthest along. Rendering three
 * equal rows would make them work out something the app could just tell them.
 *
 * The next action sits on the card. That mapping is total (see JobActions), so
 * it is unambiguous wherever the job is shown — and the one that matters most is
 * the PIN, entered standing at a customer's door, which is exactly where a saved
 * tap is worth the most.
 *
 * ## What is deliberately not here
 *
 * The address is the content, not metadata: a provider knows what service they
 * are doing and needs to know where. The payout is present but quiet — it is
 * settled and not actionable, and on this screen it competes with the address.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight, History, MapPin } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { CompleteStep, DoorstepOtpStep, EnRouteStep } from "@/components/provider/JobActions";
import { currentJob, dueIn, isActive, statusStyle, statusText } from "@/lib/job-status";
import { formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import type { Booking } from "@/lib/mock-data";

/** The action for the stage this job is at. Total over the active statuses. */
function NextAction({ job }: { job: Booking }) {
  if (job.status === "ACCEPTED") return <EnRouteStep bookingId={job.id} compact />;
  if (job.status === "EN_ROUTE") return <DoorstepOtpStep bookingId={job.id} compact />;
  if (job.status === "IN_PROGRESS") return <CompleteStep bookingId={job.id} compact />;
  return null;
}

export function LiveJobs({
  jobs,
  isLoading,
  isError,
}: {
  jobs: Booking[];
  isLoading: boolean;
  isError: boolean;
}) {
  const { t, lang } = useT("provider");
  const { t: tc } = useT();
  const active = jobs.filter(isActive);
  const due = (job: Booking) => dueIn(job, undefined, tc, lang);
  const current = currentJob(active);
  const queued = active.filter((job) => job.id !== current?.id);

  if (isLoading) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // A failed fetch must not claim there is no work — that is the one wrong
  // answer here, and a provider who believes it stops looking. Quiet rather
  // than alarming: the Jobs tab is still there and still works.
  if (isError) {
    return (
      <Link
        to="/provider/bookings"
        className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
      >
        <span className="text-sm text-muted-foreground">{t("liveJobs.loadFailed")}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          {t("liveJobs.openJobs")}
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  // Nothing live: one quiet row rather than an empty box, so the readiness
  // checklist below stays the most useful thing on an idle screen.
  if (!current) {
    return (
      <Link
        to="/provider/bookings"
        className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4 shrink-0" />
          {t("liveJobs.noJobs")}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          {t("liveJobs.viewPast")}
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  return (
    <section className="mt-6" aria-label={t("liveJobs.sectionLabel")}>
      <div className="overflow-hidden rounded-xl border border-primary/40 bg-card">
        <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            {statusText(current.status, tc)}
          </span>
          {due(current) && (
            <span className="text-xs text-primary-foreground/85">{due(current)}</span>
          )}
        </div>

        <div className="p-4">
          <Link
            to="/provider/bookings/$bookingId"
            params={{ bookingId: current.id }}
            className="block"
          >
            <p className="text-sm font-semibold text-foreground">{current.service.name}</p>
            {/* The address, given the weight the job screen gives it — this is
                what the provider is actually looking for. */}
            {current.address.full && (
              <span className="mt-2 flex items-start gap-2 rounded-lg bg-secondary/60 p-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                  {current.address.full}
                </span>
              </span>
            )}
          </Link>

          <div className="mt-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <NextAction job={current} />
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {formatRupees(current.providerPayout, lang)}
            </span>
          </div>
        </div>
      </div>

      {queued.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("liveJobs.nextUp")}
          </p>
          <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-card">
            {queued.map((job, i) => (
              <Link
                key={job.id}
                to="/provider/bookings/$bookingId"
                params={{ bookingId: job.id }}
                className={`flex items-center gap-3 p-3 transition-colors hover:bg-accent ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{job.service.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        statusStyle[job.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {statusText(job.status, tc)}
                    </span>
                    {due(job) && <span className="truncate">{due(job)}</span>}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </>
      )}

      <Link
        to="/provider/bookings"
        className="mt-3 flex items-center justify-end gap-0.5 text-sm font-medium text-primary"
      >
        {t("liveJobs.viewAll")}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
