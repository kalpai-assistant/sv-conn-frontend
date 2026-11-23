import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { InstallSheet } from "@/components/InstallSheet";
import { ApiError } from "@/lib/api";
import { enablePushNotifications, getPushPermission, type PushPermission } from "@/lib/fcm";
import { useInstallState } from "@/lib/install";
import { ProviderHomeHero } from "@/components/provider/ProviderHomeHero";
import { OnlineToggleCta } from "@/components/provider/OnlineToggleCta";
import { LiveJobs } from "@/components/provider/LiveJobs";
import { EarningsRow } from "@/components/provider/EarningsRow";
import { useBookings } from "@/hooks/useApi";
import { isActive } from "@/lib/job-status";
import { useAuth } from "@/lib/auth-context";
import { useProviderProfile, useProviderServices, useSetOnlineStatus } from "@/hooks/useApi";
import type { KycStatus } from "@/hooks/useApi";
import type { Translate } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/provider/")({
  component: ProviderHomePage,
});

// The three things the booking broadcast requires of a provider. Failing any one
// of them is completely silent otherwise — which is exactly why "no provider ever
// goes online" (SVC-155) took an investigation to spot rather than being obvious
// from the screen. Each row therefore says what is wrong and where to fix it.
type Readiness = {
  /** Stable across languages: the list key, and what `StatusIcon` branches on. */
  id: "kyc" | "online" | "services";
  label: string;
  done: boolean;
  detail: string;
  reason?: string;
  fix?: { to: string; label: string };
};

// What the KYC row should say. Only "verified" clears the gate; the other three
// each need a different thing from the provider, so they must not collapse into
// one "not verified".
function kycRow(
  status: KycStatus | undefined,
  rejectionReason: string | null | undefined,
  t: Translate,
): Readiness {
  const base = { id: "kyc", label: t("checklist.kycLabel") } as const;
  switch (status) {
    case "verified":
      return { ...base, done: true, detail: t("checklist.kycVerified") };
    case "submitted":
      return { ...base, done: false, detail: t("checklist.kycSubmitted") };
    case "rejected": {
      // The reviewer's own words, in English: quoted, not translated, and tidied
      // the same way as the Pro's (pro-kyc.ts) (SVC-444).
      const reason = rejectionReason?.trim().replace(/\.$/, "");
      return {
        ...base,
        done: false,
        detail: t("checklist.kycRejected"),
        reason: reason ? t("checklist.kycRejectedReason", { reason }) : undefined,
        fix: { to: "/provider/onboarding", label: t("checklist.kycResubmit") },
      };
    }
    default:
      return {
        ...base,
        done: false,
        detail: t("checklist.kycPending"),
        fix: { to: "/provider/onboarding", label: t("checklist.kycFinish") },
      };
  }
}

function ProviderHomePage() {
  const navigate = useNavigate();
  const { t, lang } = useT("provider");
  // Name lives on the user, not the provider profile — it is PATCHed to
  // /users/me during onboarding. Only used for the header's initials.
  const { user } = useAuth();
  const { state: installState, promptInstall } = useInstallState();
  const [showInstall, setShowInstall] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPushPermission().then((p) => {
      if (!cancelled) setPushPermission(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const { data: profile, isLoading } = useProviderProfile();
  const { data: serviceIds } = useProviderServices();
  const setOnlineStatus = useSetOnlineStatus();

  // Optimistic value shown only while the PATCH is in flight. Clearing it back to
  // null drops the switch onto server truth, which is what reverts it when the
  // request fails — a provider must never be left believing they are online when
  // the server says otherwise.
  const [pendingOnline, setPendingOnline] = useState<boolean | null>(null);

  const isVerified = profile?.kyc_status === "verified";
  const isOnline = pendingOnline ?? profile?.is_online ?? false;
  const serviceCount = serviceIds?.length ?? 0;

  // Deliberately driven by the switch's onCheckedChange and nothing else. There is
  // no mount effect and no lifecycle listener here on purpose: going online means
  // "I am accepting jobs", not "the app is open" (SVC-155 AC 3).
  const handleToggle = async (next: boolean) => {
    setPendingOnline(next);
    try {
      await setOnlineStatus.mutateAsync(next);
      toast.success(next ? t("home.toastOnline") : t("home.toastOffline"));
    } catch (err) {
      // SVC-257: backend refuses go-online when `service_area_center` is NULL
      // with a distinct code so the frontend routes to the missing wizard step
      // instead of showing a dead-end toast.
      if (err instanceof ApiError && err.code === "SERVICE_AREA_MISSING") {
        toast.error(t("home.serviceAreaMissing"));
        navigate({ to: "/provider/onboarding" });
      } else {
        toast.error(errorText(err, t("home.toggleFailed"), lang));
      }
    } finally {
      // Success or failure, stop overriding the server. On success the invalidated
      // profile already carries the new value; on failure this is the revert.
      setPendingOnline(null);
    }
  };

  const checklist: Readiness[] = [
    kycRow(profile?.kyc_status, profile?.kyc_rejection_reason, t),
    {
      id: "online",
      label: t("checklist.onlineLabel"),
      done: isOnline,
      detail: isOnline ? t("checklist.onlineOn") : t("checklist.onlineOff"),
    },
    {
      id: "services",
      label: t("checklist.servicesLabel"),
      done: serviceCount > 0,
      detail:
        serviceCount > 0
          ? t("checklist.servicesCount", { count: serviceCount })
          : t("checklist.servicesNone"),
      fix:
        serviceCount > 0
          ? undefined
          : { to: "/provider/profile", label: t("checklist.servicesFix") },
    },
  ];

  const eligible = checklist.every((item) => item.done);

  // Work in hand (SVC-274). `refetchOnWindowFocus` is on by default and
  // `useAcceptOffer` already invalidates ["bookings"], so this stays current
  // when a job is accepted or finished without a manual reload.
  const { data: bookings, isLoading: jobsLoading, isError: jobsError } = useBookings();
  const liveJobs = (bookings ?? []).filter(isActive);

  // SVC-255 item 3. A provider in an iOS Safari tab passes all three checks
  // above and is still unreachable — Apple grants Web Push only to an installed
  // site — so "You're set up to receive jobs" is, for them, a false
  // reassurance. That is the ticket's original bug wearing a green tick.
  //
  // Surfaced here rather than as a modal after login: the checklist is already
  // the place that explains why work is or isn't arriving, so this belongs in
  // that vocabulary instead of interrupting. It is also deliberately not shown
  // at the go-online toggle — installing signs the provider out on iOS, and
  // dropping their session the instant they ask for work would read as the app
  // breaking. Here they choose the moment.
  const canFixPush =
    pushPermission === "unsupported" &&
    (installState === "can-prompt" ||
      installState === "ios-manual" ||
      installState === "ios-wrong-browser");

  if (isLoading) {
    return (
      <div className="min-h-screen p-6 pb-24">
        {/* SVC-491: the hero renders here too so the greeting + avatar do
            not pop in once the profile lands. The photo is absent until
            then; the initials come from the user, already restored by
            this point. Profile stays reachable via the avatar — it is
            still the only entry point since SVC-273. */}
        <ProviderHomeHero name={user?.name} />
        <p className="mt-4 text-sm text-muted-foreground">{t("home.loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 pb-24">
      {/* SVC-491 hero. SVC-273's rule still holds: the avatar is the only
          path into Provider Profile. */}
      <ProviderHomeHero name={user?.name} photoUrl={profile?.profile_photo_url} />

      {/* SVC-491 — online-toggle rework. Pre-Phase-2 this was a shadcn
          Switch inside a bordered card: functionally correct but it read
          as a settings row, not the single most important commitment of
          a provider's session. Replaced with a full-width CTA whose
          outer glow pulses while offline (ambient pulse, framer-motion
          `animate` on opacity, honours reduced-motion) and collapses to
          a quiet drop-shadow while online. The commitment itself fires a
          Medium haptic (`hapticImpactMedium`, SVC-398 wrapper extended
          in this phase) — a heavier beat than SVC-490's Light taps
          because this gesture materially changes whether jobs are
          dispatched.

          Disabled below "verified" for the same reason it was before:
          the backend's broadcast filters on KYC, and a pressable CTA
          here would promise something the server won't honour. */}
      <OnlineToggleCta
        isOnline={isOnline}
        isVerified={isVerified}
        pending={setOnlineStatus.isPending}
        onToggle={handleToggle}
      />

      {canFixPush && (
        <button
          onClick={() => setShowInstall(true)}
          className="mt-6 flex w-full items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:hover:bg-amber-900/40"
        >
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-100">{t("home.pushTitle")}</p>
            <p className="text-amber-800 dark:text-amber-200">
              {installState === "ios-wrong-browser" ? t("home.pushSafari") : t("home.pushInstall")}
            </p>
          </div>
        </button>
      )}

      <InstallSheet
        open={showInstall}
        onOpenChange={setShowInstall}
        state={installState}
        onInstall={async () => {
          if (await promptInstall()) {
            setShowInstall(false);
            const result = await enablePushNotifications();
            setPushPermission(result.status);
          }
        }}
      />

      {/* Work in hand comes before eligibility for more of it (SVC-274). A
          provider mid-job does not need three green ticks telling them they
          qualify — they need the address they are driving to. */}
      <LiveJobs jobs={bookings ?? []} isLoading={jobsLoading} isError={jobsError} />

      {/* Earnings, under the work (SVC-275). Below LiveJobs because the job in
          hand outranks the money already banked, and above the checklist
          because a provider who is set up has no reason to read three green
          ticks again. One figure only — see EarningsRow. */}
      <EarningsRow />

      {/* Why the provider is or isn't getting work.

          Hidden only when they are eligible *and* busy. An ineligible provider
          keeps it whatever their job count: it is the one thing on screen
          explaining why no more work is coming, and that matters most to
          someone who somehow holds a job while unverified.

          SVC-491: when the provider is eligible and idle (the dominant idle
          state on Home), collapse the three-row readiness list to a single
          "Account health ✓" row with a chevron — see
          {@link AccountHealthCollapsible}. Three green ticks every visit
          does not earn its screen share, and an idle-eligible provider
          staring at it reads it as "you did everything right but no
          customers". The row stays expandable for the rare case where a
          provider wants to re-verify what's set up. Ineligible path keeps
          the full list, unchanged. */}
      {!(eligible && liveJobs.length > 0) && eligible ? (
        <AccountHealthCollapsible checklist={checklist} kycStatus={profile?.kyc_status} />
      ) : (
        !(eligible && liveJobs.length > 0) && (
          <div className="mt-6">
            <div
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                eligible
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                  : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
              }`}
            >
              {eligible ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <div className="text-sm">
                <p
                  className={`font-medium ${
                    eligible
                      ? "text-emerald-900 dark:text-emerald-100"
                      : "text-amber-900 dark:text-amber-100"
                  }`}
                >
                  {eligible ? t("home.eligibleTitle") : t("home.ineligibleTitle")}
                </p>
                <p
                  className={
                    eligible
                      ? "text-emerald-800 dark:text-emerald-200"
                      : "text-amber-800 dark:text-amber-200"
                  }
                >
                  {eligible ? t("home.eligibleDetail") : t("home.ineligibleDetail")}
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-3">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <StatusIcon done={item.done} status={profile?.kyc_status} id={item.id} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-muted-foreground">{item.detail}</p>
                    {/* Typed by a reviewer, up to 500 characters: an unbroken string
                      must wrap rather than push the page sideways. */}
                    {item.reason && (
                      <p className="mt-1 text-foreground [overflow-wrap:anywhere]">{item.reason}</p>
                    )}
                    {item.fix && (
                      <Link
                        to={item.fix.to}
                        className="mt-1 inline-flex items-center gap-0.5 font-medium text-primary"
                      >
                        {item.fix.label}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

// SVC-491 — when an eligible provider's screen is otherwise all green,
// the three-row readiness list reads as noise. Collapse to a single row
// with a chevron that expands the full list on tap. The row's own
// CheckCircle2 matches the pattern Home already uses for "done" items,
// so a provider recognises the state at a glance. Deliberately not a
// Radix Collapsible: a 15-line `useState` + conditional render is less
// machinery for the same affordance, and the row is a native <button>
// so screen readers announce aria-expanded without extra wiring.
function AccountHealthCollapsible({
  checklist,
  kycStatus,
}: {
  checklist: Readiness[];
  kycStatus: KycStatus | undefined;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useT("provider");

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-left transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40"
      >
        <span className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            {t("home.accountHealthOk")}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-emerald-700 transition-transform dark:text-emerald-300 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <ul className="mt-3 space-y-3">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <StatusIcon done={item.done} status={kycStatus} id={item.id} />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// "Under review" and "rejected" are both incomplete, but they mean opposite things
// to the provider — one is waiting on us, the other is waiting on them.
function StatusIcon({
  done,
  status,
  id,
}: {
  done: boolean;
  status: KycStatus | undefined;
  id: Readiness["id"];
}) {
  if (done)
    return (
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    );
  if (id === "kyc" && status === "submitted") {
    return <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />;
  }
  if (id === "kyc" && status === "rejected") {
    return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />;
  }
  return <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />;
}
