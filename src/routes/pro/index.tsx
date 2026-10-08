import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, ChevronRight, Clock, History, MapPin, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ProHeader } from "@/components/pro/ProHeader";
import { useAuth } from "@/lib/auth-context";
import { useProJobs, useProMe, useSetProOnline, type ProMe } from "@/hooks/usePro";
import { currentJob, dueIn, statusLabel, statusStyle } from "@/lib/job-status";
import { proKycCopy, proOnlineSwitch } from "@/lib/pro-kyc";
import type { Booking } from "@/lib/mock-data";

export const Route = createFileRoute("/pro/")({
  component: ProHomePage,
});

// SVC-322 — the Pro's landing screen. Three things, in the order a Pro needs
// them: whether they can be given work at all (KYC, online), the job in hand,
// and a way out to the consumer app, which is the same account.
//
// What is deliberately not here, against Provider Home: no earnings (a team
// Pro's pay goes to their SP, SVC-323), no services checklist (the SP's
// subscriptions decide what work the team gets), and no incoming-request card
// (the SP accepts a job and picks the Pro; the Pro is told by the "assigned"
// push).
function ProHomePage() {
  const { user } = useAuth();
  const { data: me } = useProMe(user?.id);
  const { data, isLoading: jobsLoading, isError: jobsError } = useProJobs("active");
  const jobs = data?.jobs ?? [];

  return (
    <div className="min-h-screen p-6 pb-24">
      <ProHeader
        title="Pro Home"
        name={user?.name}
        photoUrl={me?.profile_photo_url}
        team={me?.service_provider}
      />

      {me ? <OnlineCard me={me} /> : <Skeleton className="mt-6 h-20 w-full" />}
      {me && <KycCard me={me} />}

      <CurrentJob jobs={jobs} isLoading={jobsLoading} isError={jobsError} />

      {/* The same account is a customer account too. A link, not a switcher:
          the gate lands a Pro here once per sign-in and then leaves them be,
          so "/" stays the consumer app for as long as they are in it. */}
      <Link
        to="/"
        className="mt-8 flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
      >
        <ShoppingBag className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">Book a service</span>
          <span className="block text-xs text-muted-foreground">
            Use EazyServ as a customer. Your Pro app is one tap away on Profile.
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}

/**
 * The online switch. An unverified Pro can switch off but not on; the rule
 * and why are in `proOnlineSwitch`.
 */
function OnlineCard({ me }: { me: ProMe }) {
  const setOnline = useSetProOnline();
  // Shown only while the request is in flight; null falls back to server truth,
  // which is also what reverts a failed toggle (same rule as Provider Home).
  const [pending, setPending] = useState<boolean | null>(null);
  const isOnline = pending ?? me.is_online;
  const { canToggle, detail } = proOnlineSwitch({
    isOnline,
    isVerified: me.kyc_status === "verified",
  });

  // Driven by the switch and nothing else. Online means "give me jobs", not
  // "the app is open" (SVC-155 AC 3).
  const handleToggle = async (next: boolean) => {
    setPending(next);
    try {
      await setOnline.mutateAsync(next);
      toast.success(next ? "You're online — your team can give you jobs" : "You're offline");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't update your status. Please try again.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{isOnline ? "You're online" : "Offline"}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <Switch
          checked={isOnline}
          onCheckedChange={handleToggle}
          disabled={!canToggle || setOnline.isPending}
          aria-label="Available for jobs"
        />
      </div>
    </div>
  );
}

function KycCard({ me }: { me: ProMe }) {
  const copy = proKycCopy(me);
  if (!copy) return null;
  const waiting = me.kyc_status === "submitted";
  return (
    <div
      className={`mt-4 flex items-start gap-3 rounded-lg border p-3 ${
        waiting ? "border-amber-300 bg-amber-50" : "border-destructive/40 bg-destructive/5"
      }`}
    >
      {waiting ? (
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      ) : (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="text-muted-foreground">{copy.detail}</p>
      </div>
    </div>
  );
}

/**
 * The job in hand, or a quiet idle row. Same shape as Provider Home's LiveJobs
 * (one current card, the rest queued) and the same `currentJob` choice of which
 * job that is — but it links into the Pro app and carries no payout.
 */
function CurrentJob({
  jobs,
  isLoading,
  isError,
}: {
  jobs: Booking[];
  isLoading: boolean;
  isError: boolean;
}) {
  const current = currentJob(jobs);
  const queued = jobs.filter((job) => job.id !== current?.id);

  if (isLoading) return <Skeleton className="mt-6 h-32 w-full" />;

  // A failed fetch must not claim there is no work: a Pro who believes it
  // stops looking.
  if (isError) {
    return (
      <Link
        to="/pro/jobs"
        className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
      >
        <span className="text-sm text-muted-foreground">Couldn’t load your jobs</span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          Open Jobs
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  if (!current) {
    return (
      <Link
        to="/pro/jobs"
        className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4 shrink-0" />
          No job right now
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          View past jobs
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  return (
    <section className="mt-6" aria-label="Your job">
      <Link
        to="/pro/jobs/$bookingId"
        params={{ bookingId: current.id }}
        className="block overflow-hidden rounded-xl border border-primary/40 bg-card"
      >
        <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            {statusLabel[current.status] ?? current.status}
          </span>
          {dueIn(current) && (
            <span className="text-xs text-primary-foreground/85">{dueIn(current)}</span>
          )}
        </div>
        <div className="p-4">
          <p className="text-sm font-semibold text-foreground">{current.service.name}</p>
          {current.address.full && (
            <span className="mt-2 flex items-start gap-2 rounded-lg bg-secondary/60 p-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                {current.address.full}
              </span>
            </span>
          )}
          <span className="mt-3 flex items-center justify-end gap-0.5 text-sm font-medium text-primary">
            Open job
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </Link>

      {queued.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Next up
          </p>
          <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-card">
            {queued.map((job, i) => (
              <Link
                key={job.id}
                to="/pro/jobs/$bookingId"
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
                      {statusLabel[job.status] ?? job.status}
                    </span>
                    {dueIn(job) && <span className="truncate">{dueIn(job)}</span>}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
