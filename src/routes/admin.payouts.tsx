/**
 * Admin provider-payouts page (SVC-144 / PAY-13 · history: SVC-300).
 *
 * Lists every provider the platform owes money to, largest debt first, and lets
 * an admin settle one with a single "Pay out" — each press moves real money, so
 * the amount and booking count are restated in a confirmation dialog first.
 *
 * SVC-300: each row is expandable inline to the provider's past-payout
 * history. This closes the double-dispatch gap that used to invite
 * manual re-triggering — the admin can now see "yes, we already paid
 * them last week" without leaving the screen. The history also drives
 * a 60-second in-flight guard on the trigger button: a payout with an
 * unresolved outcome from < 60s ago disables the button rather than
 * letting a jumpy admin fire a second one.
 *
 * Beta scope:
 * - No pagination on the pending list; the backend caps at 200 and sets `truncated`
 * - No filtering or re-sorting; server order (amount owed, desc) is authoritative
 * - Failed/reversed settlements are re-queued from the backend, not from here
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, IndianRupee, Loader2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPaise } from "@/lib/currency";
import {
  PAYOUT_IN_FLIGHT_OUTCOMES,
  useProviderPayoutHistory,
  usePendingSettlements,
  useTriggerPayout,
  type API_PendingSettlementProvider,
  type API_ProviderPayoutHistoryEntry,
} from "@/hooks/useApi";

export const Route = createFileRoute("/admin/payouts")({
  component: AdminPayoutsPage,
});

const pluralBookings = (n: number) => `${n} booking${n === 1 ? "" : "s"}`;

/** Providers can register with a phone and no name — never render an empty row. */
const displayName = (p: API_PendingSettlementProvider) => p.name ?? p.phone;

// Window used by the 60s in-flight guard. Kept small: two clicks a couple
// of seconds apart are the failure mode we care about, and a slow admin
// deliberately waiting 30s should still be allowed.
const IN_FLIGHT_WINDOW_MS = 60_000;

function AdminPayoutsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = usePendingSettlements();
  const [target, setTarget] = useState<API_PendingSettlementProvider | null>(null);
  // Only one row expanded at a time — the history view is dense enough that
  // stacking three or four of them at once buries the pending list.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const providers = data?.providers ?? [];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center gap-3">
        <IndianRupee className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pending settlements</h1>
          <p className="text-sm text-muted-foreground">
            Providers awaiting payout, largest amount owed first.
          </p>
        </div>
      </header>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive bg-destructive/5 p-6 text-center">
          {/* Surface the backend message rather than a generic string: a 403 here
              means "not an admin", which is the one thing the admin can act on. */}
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Couldn't load pending settlements."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {/* The list is capped server-side. Without this the admin reads an empty-ish
          list as "everyone is paid" while providers below the cut stay unpaid. */}
      {!isLoading && !isError && data?.truncated && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              Showing {providers.length} of {data.total}
            </p>
            <p className="text-amber-800">
              {data.total - providers.length} more provider
              {data.total - providers.length === 1 ? " is" : "s are"} owed money and not shown here.
              The list refreshes as you settle these.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !isError && providers.length === 0 && (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center">
          <p className="text-sm font-medium text-foreground">No pending settlements.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every provider is settled up. Newly completed bookings will appear here.
          </p>
        </div>
      )}

      {!isLoading && providers.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {providers.map((p) => (
            <li key={p.provider_id}>
              <SettlementRow
                provider={p}
                expanded={expandedId === p.provider_id}
                onToggleExpand={() =>
                  setExpandedId((cur) => (cur === p.provider_id ? null : p.provider_id))
                }
                onPayOut={() => setTarget(p)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          ← Back home
        </Button>
      </div>

      <PayoutConfirmDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

// KYCStatus values from the backend: "pending" | "submitted" | "verified" | "rejected".
// "verified" is the only one that unlocks payouts (SVC-189 / G16).
const KYC_BADGE: Record<
  API_PendingSettlementProvider["kyc_status"],
  { label: string; variant: "default" | "secondary" | "destructive" } | null
> = {
  // Verified is the happy path — no badge, the absence of one is the signal.
  verified: null,
  pending: { label: "KYC pending", variant: "secondary" },
  submitted: { label: "KYC review", variant: "secondary" },
  rejected: { label: "KYC rejected", variant: "destructive" },
};

function SettlementRow({
  provider,
  expanded,
  onToggleExpand,
  onPayOut,
}: {
  provider: API_PendingSettlementProvider;
  expanded: boolean;
  onToggleExpand: () => void;
  onPayOut: () => void;
}) {
  const kycBadge = KYC_BADGE[provider.kyc_status];
  // History is only fetched once the admin actually expands the row — 200
  // provider list × one prefetched history each is a lot of work the operator
  // never asked for. `enabled=expanded` gates the query.
  const history = useProviderPayoutHistory(provider.provider_id, expanded);
  // The 60s in-flight guard depends on the just-fetched history — computed
  // here rather than server-side so no new backend field is needed and the
  // guard stays in sync with what the admin sees below.
  const inFlight = findInFlightPayout(history.data?.entries ?? []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide payout history" : "Show payout history"}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">
                {displayName(provider)}
              </p>
              {/* Deactivated providers are still owed for work already done — show the
                  state, but keep the row payable. */}
              {!provider.is_active && (
                <Badge variant="secondary" className="shrink-0">
                  Deactivated
                </Badge>
              )}
              {/* SVC-189 (G16): surface KYC inline so the admin sees it without
                  opening the provider profile. The Pay out button is also gated
                  on this — see PayOutButton. */}
              {kycBadge && (
                <Badge variant={kycBadge.variant} className="shrink-0">
                  {kycBadge.label}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {provider.name ? `${provider.phone} · ` : ""}
              {pluralBookings(provider.pending_booking_count)}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatPaise(provider.pending_payout_paise)}
          </span>
          <PayOutButton provider={provider} inFlight={inFlight} onPayOut={onPayOut} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-secondary/20 p-4">
          <PayoutHistory
            isLoading={history.isLoading}
            isError={history.isError}
            error={history.error}
            entries={history.data?.entries ?? []}
            total={history.data?.total ?? 0}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The most recent in-flight payout under the 60s window, or null.
 *
 * "In flight" is any outcome we haven't confirmed as terminal — a fresh row
 * with outcome=attempting/initiated/processing means the money is either on
 * its way or the response was lost, and firing another Pay out now would risk
 * a duplicate dispatch. The list is already newest-first from the backend, so
 * the first matching row is the most recent.
 */
function findInFlightPayout(
  entries: API_ProviderPayoutHistoryEntry[],
): API_ProviderPayoutHistoryEntry | null {
  const cutoff = Date.now() - IN_FLIGHT_WINDOW_MS;
  for (const entry of entries) {
    if (!PAYOUT_IN_FLIGHT_OUTCOMES.has(entry.outcome)) continue;
    if (new Date(entry.created_at).getTime() < cutoff) continue;
    return entry;
  }
  return null;
}

function PayOutButton({
  provider,
  inFlight,
  onPayOut,
}: {
  provider: API_PendingSettlementProvider;
  inFlight: API_ProviderPayoutHistoryEntry | null;
  onPayOut: () => void;
}) {
  // Precedence: KYC gate (SVC-189 / G16) trumps the payout-details gate. If
  // KYC isn't verified the payout will 402 even with details on file, and
  // the fix (KYC review) is different from "provider must add UPI or bank".
  // Naming the actual blocker up-front avoids a two-step debug loop. The
  // in-flight guard sits below both — a KYC-blocked provider being also-in-
  // flight is a weirder story to tell, and KYC is the fix the admin can act on.
  const kycBlocked = provider.kyc_status !== "verified";
  const detailsMissing = !provider.payout_set;

  if (!kycBlocked && !detailsMissing && !inFlight) {
    return (
      <Button size="sm" onClick={onPayOut}>
        Pay out
      </Button>
    );
  }

  let tooltip: string;
  if (kycBlocked) {
    tooltip = `KYC not verified (${provider.kyc_status}) — review KYC before paying out.`;
  } else if (detailsMissing) {
    tooltip = "No payout details on file — provider must add UPI or bank.";
  } else {
    // SVC-300: the double-dispatch guard. Explain what to wait for + why so
    // the admin doesn't refresh in a panic — the backend also refuses (SVC-172)
    // but the error message is harder to read than a tooltip.
    const seconds = Math.max(
      1,
      Math.round((Date.now() - new Date(inFlight!.created_at).getTime()) / 1000),
    );
    tooltip = `Payout in flight from ${seconds}s ago (${inFlight!.outcome}) — wait for completion before triggering another.`;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        {/* Disabled buttons emit no pointer events, so the trigger wraps a span. */}
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button size="sm" disabled className="pointer-events-none">
              Pay out
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// SVC-300: payout_audits.outcome values → display badge. Free-form on the
// backend (see PayoutService._resolve_audit / reconcile paths), so unknown
// values pass through with a neutral badge rather than crashing the row.
const OUTCOME_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  processed: { label: "Processed", variant: "default" },
  completed: { label: "Completed", variant: "default" },
  processing: { label: "Processing", variant: "secondary" },
  initiated: { label: "Initiated", variant: "secondary" },
  queued: { label: "Queued", variant: "secondary" },
  attempting: { label: "Attempting", variant: "secondary" },
  unknown: { label: "Unknown", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
  rejected: { label: "Rejected", variant: "destructive" },
  reversed: { label: "Reversed", variant: "destructive" },
  requeued: { label: "Re-queued", variant: "outline" },
};

function PayoutHistory({
  isLoading,
  isError,
  error,
  entries,
  total,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  entries: API_ProviderPayoutHistoryEntry[];
  total: number;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Couldn't load payout history."}
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No past payouts for this provider.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Past payouts ({total})
      </p>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.audit_id}>
            <PayoutHistoryRow entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PayoutHistoryRow({ entry }: { entry: API_ProviderPayoutHistoryEntry }) {
  const created = new Date(entry.created_at);
  const badge = OUTCOME_BADGE[entry.outcome] ?? {
    label: entry.outcome,
    variant: "outline" as const,
  };
  // Prefer the RazorpayX payout id (`pout_XXX`) for the admin's copy handle —
  // that's the string RazorpayX dashboards key on. Fall back to the batch
  // reference key when the payout attempt never got a pout_id assigned (an
  // outcome=unknown row, where the RazorpayX call raised before returning).
  const reference = entry.payout_id ?? entry.reference_id;
  const isReconciliation = entry.source === "reconciliation";

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatPaise(entry.amount_paise)}
          </span>
          <span className="text-xs text-muted-foreground">
            · {pluralBookings(entry.booking_count)}
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="text-xs text-muted-foreground"
                tabIndex={0}
                aria-label={`Payout initiated ${created.toLocaleString()}`}
              >
                {formatDistanceToNowStrict(created, { addSuffix: true })}
              </span>
            </TooltipTrigger>
            <TooltipContent>{created.toLocaleString()}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{isReconciliation ? "Reconciliation (system)" : (entry.admin_name ?? "Admin")}</span>
        {reference ? (
          <CopyRef value={reference} />
        ) : (
          <span className="text-muted-foreground/70">no payout reference</span>
        )}
      </div>

      {entry.error && <p className="mt-2 text-xs text-destructive">Error: {entry.error}</p>}
    </div>
  );
}

function CopyRef({ value }: { value: string }) {
  // Reset state after a moment so a second copy re-shows the "Copied" flash;
  // otherwise the admin has no way to tell whether the second click landed.
  const [copied, setCopied] = useState(false);

  const copy = () => {
    // navigator.clipboard is unavailable on http (some admin dev setups) —
    // surface a toast rather than a silent no-op so the admin knows to copy
    // by hand.
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard unavailable in this browser context.");
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Couldn't copy — check clipboard permissions."));
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded font-mono text-xs text-foreground hover:text-primary"
      aria-label={`Copy payout reference ${value}`}
    >
      <span>{value}</span>
      <Copy className="h-3 w-3" aria-hidden="true" />
      {copied && <span className="text-primary">Copied</span>}
    </button>
  );
}

function PayoutConfirmDialog({
  target,
  onClose,
}: {
  target: API_PendingSettlementProvider | null;
  onClose: () => void;
}) {
  const triggerPayout = useTriggerPayout();
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    if (!target) return;
    setError(null);
    triggerPayout.mutate(target.provider_id, {
      // SVC-188 (G30): the endpoint returns 202 with a queued estimate. The
      // RazorpayX call happens in a worker, so the final status shows up
      // asynchronously via the audit trail / webhook, not in this response.
      onSuccess: (res) => {
        toast.success(`Payout queued: ${formatPaise(res.amount_paise)}`, {
          description: `${pluralBookings(res.booking_count)} · settling in the background`,
        });
        close();
      },
      // Keep the dialog open on failure: the backend message carries the reason
      // (402 = nothing pending / no payout details), and closing would bin it.
      onError: (err) => setError(err instanceof Error ? err.message : "Payout failed. Try again."),
    });
  };

  const busy = triggerPayout.isPending;

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && !busy && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Pay {target ? formatPaise(target.pending_payout_paise) : ""} to{" "}
            {target ? displayName(target) : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `Settles ${pluralBookings(target.pending_booking_count)} to ${target.phone}. This transfers money and can't be undone here.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              // AlertDialogAction closes the dialog by default; prevent that so a
              // failed payout can show its error inline instead of vanishing.
              e.preventDefault();
              handleConfirm();
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm payout"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
