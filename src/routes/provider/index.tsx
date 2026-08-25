import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Circle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useProviderProfile, useProviderServices, useSetOnlineStatus } from "@/hooks/useApi";
import type { KycStatus } from "@/hooks/useApi";

export const Route = createFileRoute("/provider/")({
  component: ProviderHomePage,
});

// The three things the booking broadcast requires of a provider. Failing any one
// of them is completely silent otherwise — which is exactly why "no provider ever
// goes online" (SVC-155) took an investigation to spot rather than being obvious
// from the screen. Each row therefore says what is wrong and where to fix it.
type Readiness = {
  label: string;
  done: boolean;
  detail: string;
  fix?: { to: string; label: string };
};

// What the KYC row should say. Only "verified" clears the gate; the other three
// each need a different thing from the provider, so they must not collapse into
// one "not verified".
function kycRow(status: KycStatus | undefined): Readiness {
  switch (status) {
    case "verified":
      return { label: "Identity verified", done: true, detail: "Your documents were approved." };
    case "submitted":
      return {
        label: "Identity verified",
        done: false,
        detail: "Your documents are under review. This usually takes a day.",
      };
    case "rejected":
      return {
        label: "Identity verified",
        done: false,
        detail: "Your documents were rejected. Please submit them again.",
        fix: { to: "/provider/onboarding", label: "Resubmit documents" },
      };
    default:
      return {
        label: "Identity verified",
        done: false,
        detail: "Finish onboarding and upload your documents.",
        fix: { to: "/provider/onboarding", label: "Finish onboarding" },
      };
  }
}

function ProviderHomePage() {
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
      toast.success(next ? "You're online — you'll get job requests" : "You're offline");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't update your status. Please try again.",
      );
    } finally {
      // Success or failure, stop overriding the server. On success the invalidated
      // profile already carries the new value; on failure this is the revert.
      setPendingOnline(null);
    }
  };

  const checklist: Readiness[] = [
    kycRow(profile?.kyc_status),
    {
      label: "Online",
      done: isOnline,
      detail: isOnline
        ? "You're accepting job requests."
        : "Turn on the switch above to start receiving requests.",
    },
    {
      label: "At least one service",
      done: serviceCount > 0,
      detail:
        serviceCount > 0
          ? `You're subscribed to ${serviceCount} service${serviceCount === 1 ? "" : "s"}.`
          : "Pick the services you offer so we know what to send you.",
      fix:
        serviceCount > 0 ? undefined : { to: "/provider/profile", label: "Choose your services" },
    },
  ];

  const eligible = checklist.every((item) => item.done);

  if (isLoading) {
    return (
      <div className="min-h-screen p-6">
        <h1 className="text-lg font-semibold text-foreground">Provider Home</h1>
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <h1 className="text-lg font-semibold text-foreground">Provider Home</h1>

      {/* The toggle. Disabled below "verified" because the broadcast filters on KYC
          too — an enabled switch would promise something the backend won't honour. */}
      <div className="mt-6 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{isOnline ? "You're online" : "Offline"}</p>
            <p className="text-sm text-muted-foreground">
              {isVerified
                ? "Only receive job requests while this is on."
                : "You can go online once your identity is verified."}
            </p>
          </div>
          <Switch
            checked={isOnline}
            onCheckedChange={handleToggle}
            disabled={!isVerified || setOnlineStatus.isPending}
            aria-label="Accept job requests"
          />
        </div>
      </div>

      {/* Why the provider is or isn't getting work. */}
      <div className="mt-6">
        <div
          className={`flex items-start gap-3 rounded-lg border p-3 ${
            eligible ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          {eligible ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div className="text-sm">
            <p className={`font-medium ${eligible ? "text-emerald-900" : "text-amber-900"}`}>
              {eligible ? "You're set up to receive jobs" : "You won't receive job requests yet"}
            </p>
            <p className={eligible ? "text-emerald-800" : "text-amber-800"}>
              {eligible
                ? "New requests matching your services will appear here."
                : "All three of these are needed before we can send you a job."}
            </p>
          </div>
        </div>

        <ul className="mt-3 space-y-3">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              <StatusIcon done={item.done} status={profile?.kyc_status} label={item.label} />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-muted-foreground">{item.detail}</p>
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
    </div>
  );
}

// "Under review" and "rejected" are both incomplete, but they mean opposite things
// to the provider — one is waiting on us, the other is waiting on them.
function StatusIcon({
  done,
  status,
  label,
}: {
  done: boolean;
  status: KycStatus | undefined;
  label: string;
}) {
  if (done) return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />;
  if (label === "Identity verified" && status === "submitted") {
    return <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />;
  }
  if (label === "Identity verified" && status === "rejected") {
    return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />;
  }
  return <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />;
}
