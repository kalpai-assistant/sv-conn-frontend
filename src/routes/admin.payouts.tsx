/**
 * Admin provider-payouts page (SVC-144 / PAY-13).
 *
 * Lists every provider the platform owes money to, largest debt first, and lets
 * an admin settle one with a single "Pay out" — each press moves real money, so
 * the amount and booking count are restated in a confirmation dialog first.
 *
 * Beta scope:
 * - No pagination; the backend caps the list at 200 and sets `truncated`
 * - No filtering or re-sorting; server order (amount owed, desc) is authoritative
 * - Failed/reversed settlements are re-queued from the backend, not from here
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, IndianRupee, Loader2 } from "lucide-react";
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
  usePendingSettlements,
  useTriggerPayout,
  type API_PendingSettlementProvider,
} from "@/hooks/useApi";

export const Route = createFileRoute("/admin/payouts")({
  component: AdminPayoutsPage,
});

const pluralBookings = (n: number) => `${n} booking${n === 1 ? "" : "s"}`;

/** Providers can register with a phone and no name — never render an empty row. */
const displayName = (p: API_PendingSettlementProvider) => p.name ?? p.phone;

function AdminPayoutsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = usePendingSettlements();
  const [target, setTarget] = useState<API_PendingSettlementProvider | null>(null);

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
              <SettlementRow provider={p} onPayOut={() => setTarget(p)} />
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

function SettlementRow({
  provider,
  onPayOut,
}: {
  provider: API_PendingSettlementProvider;
  onPayOut: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{displayName(provider)}</p>
          {/* Deactivated providers are still owed for work already done — show the
              state, but keep the row payable. */}
          {!provider.is_active && (
            <Badge variant="secondary" className="shrink-0">
              Deactivated
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {provider.name ? `${provider.phone} · ` : ""}
          {pluralBookings(provider.pending_booking_count)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatPaise(provider.pending_payout_paise)}
        </span>
        <PayOutButton provider={provider} onPayOut={onPayOut} />
      </div>
    </div>
  );
}

function PayOutButton({
  provider,
  onPayOut,
}: {
  provider: API_PendingSettlementProvider;
  onPayOut: () => void;
}) {
  if (provider.payout_set) {
    return (
      <Button size="sm" onClick={onPayOut}>
        Pay out
      </Button>
    );
  }

  // No UPI/bank details on file — the payout call would 402. Say so up front
  // rather than letting the admin click into a failure.
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
        <TooltipContent>No payout details on file — provider must add UPI or bank.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
      onSuccess: (res) => {
        toast.success(`Paid ${formatPaise(res.amount)}`, {
          description: `Payout ${res.payout_id} · ${pluralBookings(res.booking_count)}`,
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
