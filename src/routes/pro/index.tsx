import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  History,
  Loader2,
  MapPin,
  MapPinOff,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrentJobSkeleton } from "@/components/skeletons/CurrentJobSkeleton";
import { ProHeader } from "@/components/pro/ProHeader";
import { useAuth } from "@/lib/auth-context";
import { useProJobs, useProMe, useSetProOnline, type ProMe } from "@/hooks/usePro";
import { currentJob, dueIn, statusStyle, statusText } from "@/lib/job-status";
import { CompleteStep, DoorstepOtpStep, EnRouteStep } from "@/components/provider/JobActions";
import { recheckProLocation, useProLocationStatus } from "@/hooks/useProHeartbeat";
import { askForProLocation, locationNeedsAttention, locationWarning } from "@/lib/pro-location";
import { proKycCopy, proOnlineSwitch } from "@/lib/pro-kyc";
import type { Booking } from "@/lib/mock-data";
import { useT } from "@/i18n/LanguageProvider";
import { errorText } from "@/i18n/errors";

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
  const { t } = useT("pro");

  return (
    <div className="min-h-screen p-6 pb-24">
      <ProHeader
        title={t("home.title")}
        name={user?.name}
        photoUrl={me?.profile_photo_url}
        team={me?.service_provider}
      />

      {me ? <OnlineCard me={me} /> : <Skeleton className="mt-6 h-20 w-full" />}
      {me?.is_online && <LocationBanner />}
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
          <span className="block text-sm font-medium text-foreground">{t("home.bookService")}</span>
          <span className="block text-xs text-muted-foreground">{t("home.bookServiceDetail")}</span>
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
  const { t, lang } = useT("pro");
  const { canToggle, detail } = proOnlineSwitch(
    { isOnline, isVerified: me.kyc_status === "verified" },
    t,
  );

  // Driven by the switch and nothing else. Online means "give me jobs", not
  // "the app is open" (SVC-155 AC 3).
  const handleToggle = async (next: boolean) => {
    setPending(next);
    try {
      await setOnline.mutateAsync(next);
      toast.success(next ? t("home.toastOnline") : t("home.toastOffline"));
      // Ask for location after going online, never before: a Pro who says no
      // is still online (warn, never block — Tushar, 2026-10-08), and the
      // banner keeps asking. The tap that got here is the user gesture the
      // permission dialog needs.
      if (next) {
        // Its own failure is not a failed toggle: they are online either way.
        await askForProLocation().catch(() => null);
        await recheckProLocation();
      }
    } catch (err) {
      toast.error(errorText(err, t("home.toggleFailed"), lang));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {isOnline ? t("home.online") : t("home.offline")}
          </p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <Switch
          checked={isOnline}
          onCheckedChange={handleToggle}
          disabled={!canToggle || setOnline.isPending}
          aria-label={t("home.availableForJobs")}
        />
      </div>
    </div>
  );
}

function KycCard({ me }: { me: ProMe }) {
  const { t } = useT("pro");
  const copy = proKycCopy(me, t);
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
        {/* "submitted" is waiting on us; there is nothing for the Pro to do. */}
        {!waiting && (
          <Link
            to="/pro/kyc"
            className="mt-1 inline-flex items-center gap-0.5 font-medium text-primary"
          >
            {me.kyc_status === "rejected" ? t("home.submitAgain") : t("home.verifyNow")}
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * "Location is off" while online. A warning, never a block: the Pro stays
 * online and keeps getting jobs (Tushar, 2026-10-08). Only shown once the
 * heartbeat has actually found a problem; a slow first fix says nothing.
 */
function LocationBanner() {
  const status = useProLocationStatus();
  const [asking, setAsking] = useState(false);
  const { t } = useT("pro");
  if (!status || !locationNeedsAttention(status)) return null;
  const { title, detail } = locationWarning(status, t);

  const fix = async () => {
    setAsking(true);
    try {
      await askForProLocation();
      await recheckProLocation();
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <MapPinOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-amber-900">{title}</p>
        <p className="text-amber-800">{detail}</p>
        {/* After a denial Android will not ask again; only Settings undoes it. */}
        {status !== "denied" && (
          <button
            type="button"
            onClick={fix}
            disabled={asking}
            className="mt-1 inline-flex items-center gap-1 font-medium text-primary disabled:opacity-60"
          >
            {asking && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("home.turnOnLocation")}
          </button>
        )}
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
  const { t, lang } = useT("pro");
  const { t: tc } = useT();

  if (isLoading) return <CurrentJobSkeleton />;

  // A failed fetch must not claim there is no work: a Pro who believes it
  // stops looking.
  if (isError) {
    return (
      <Link
        to="/pro/jobs"
        className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
      >
        <span className="text-sm text-muted-foreground">{t("home.loadFailed")}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          {t("home.openJobs")}
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
          {t("home.noJob")}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          {t("home.viewPast")}
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  return (
    <section className="mt-6" aria-label={t("home.yourJob")}>
      <div className="overflow-hidden rounded-xl border border-primary/40 bg-card">
        <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            {statusText(current.status, tc, { pro: true })}
          </span>
          {dueIn(current, undefined, tc, lang) && (
            <span className="text-xs text-primary-foreground/85">
              {dueIn(current, undefined, tc, lang)}
            </span>
          )}
        </div>
        <div className="p-4">
          {/* The details link to the job; the next action sits below, outside
              the link, so tapping it never also opens the job. */}
          <Link to="/pro/jobs/$bookingId" params={{ bookingId: current.id }} className="block">
            <p className="text-sm font-semibold text-foreground">{current.service.name}</p>
            {current.address.full && (
              <span className="mt-2 flex items-start gap-2 rounded-lg bg-secondary/60 p-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                  {current.address.full}
                </span>
              </span>
            )}
            <span className="mt-2 flex items-center justify-end gap-0.5 text-sm font-medium text-primary">
              {t("home.openJob")}
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
          <div className="mt-3">
            <NextAction job={current} />
          </div>
        </div>
      </div>

      {queued.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("home.nextUp")}
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
                      {statusText(job.status, tc, { pro: true })}
                    </span>
                    {dueIn(job, undefined, tc, lang) && (
                      <span className="truncate">{dueIn(job, undefined, tc, lang)}</span>
                    )}
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

/** The next step for the job in hand, as on Provider Home (SVC-274). */
function NextAction({ job }: { job: Booking }) {
  if (job.status === "ACCEPTED") return <EnRouteStep bookingId={job.id} compact actor="pro" />;
  if (job.status === "EN_ROUTE") return <DoorstepOtpStep bookingId={job.id} compact actor="pro" />;
  if (job.status === "IN_PROGRESS") return <CompleteStep bookingId={job.id} compact actor="pro" />;
  return null;
}
