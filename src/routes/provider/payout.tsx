import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Trash2, WalletCards } from "lucide-react";
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
import { ApiError } from "@/lib/api";
import {
  useProviderProfile,
  useUpdatePayout,
  useSetPayoutMethod,
  useRemovePayoutMethod,
  type PayoutMethodKind,
  type ProviderProfile,
} from "@/hooks/useApi";
import { usePayoutMethodForm } from "@/hooks/usePayoutMethodForm";
import { PayoutMethodFields } from "@/components/provider/PayoutMethodFields";

export const Route = createFileRoute("/provider/payout")({
  component: ProviderPayoutPage,
});

const methodLabel = (m: PayoutMethodKind) => (m === "upi" ? "UPI ID" : "Bank account");

// Names the destination a write landed on, for the confirmation toast. Prefers the
// server's label — "••••7890", or the VPA in full — because naming the actual account
// is what lets a provider catch a wrong switch straight away. Falls back to the method
// name when the label is null, which it is for providers whose method predates SVC-148
// (the migration declined to decrypt every provider's PII just to backfill a label).
const destinationLabel = (profile: ProviderProfile, fallback: PayoutMethodKind) =>
  profile.payout_display ?? `your ${methodLabel(profile.payout_method ?? fallback).toLowerCase()}`;

// SVC-148 — manage the payout method after onboarding: see what's on file, switch
// between UPI and bank, replace either, or remove payout details entirely.
function ProviderPayoutPage() {
  const { data: profile, isLoading, isError, error } = useProviderProfile();

  return (
    <div className="min-h-screen p-6">
      <Link
        to="/provider/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Profile
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-foreground">Payout method</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Where we send your earnings. Changing this affects future payouts only.
      </p>

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {isError && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Couldn’t load your payout details."}
        </p>
      )}

      {profile && <PayoutManager profile={profile} />}
    </div>
  );
}

function PayoutManager({ profile }: { profile: ProviderProfile }) {
  const setPayoutMethod = useSetPayoutMethod();

  const active = profile.payout_method;
  // The method that isn't active. Whether anything is actually *stored* for it is
  // not in the read model — GET /providers/me describes only the active method — so
  // the switch below is offered optimistically and the 400 is what tells us.
  const other: PayoutMethodKind | null =
    active === "upi" ? "bank" : active === "bank" ? "upi" : null;

  const [switchError, setSwitchError] = useState<string | null>(null);
  // Which method the entry form starts on. Keyed into the form below so that
  // changing it remounts with a clean slate.
  const [formMethod, setFormMethod] = useState<PayoutMethodKind>(active ?? "upi");

  const handleSwitch = async () => {
    if (!other) return;
    setSwitchError(null);
    try {
      const switched = await setPayoutMethod.mutateAsync(other);
      toast.success(`Payouts now go to ${destinationLabel(switched, other)}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn’t switch your payout method. Try again.";
      setSwitchError(message);
      // 400 means nothing is stored for that method — which the button had no way to
      // know beforehand. Rather than leave a dead end, drop the form onto that method
      // so the provider's next action is the one that fixes it.
      if (err instanceof ApiError && err.status === 400) setFormMethod(other);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      {/* What's on file today */}
      {active ? (
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{methodLabel(active)}</p>
              {/* payout_display is null for providers whose method predates SVC-148 —
                  the backfill set the method but deliberately left the label empty
                  rather than guess it, so this must not render blank. */}
              <p className="truncate font-medium text-foreground">
                {profile.payout_display ?? `${methodLabel(active)} on file`}
              </p>
            </div>
            <Badge>Active</Badge>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4">
          <WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium text-foreground">No payout method yet</p>
            <p className="text-muted-foreground">
              Add a UPI ID or bank account below so we can send your earnings.
            </p>
          </div>
        </div>
      )}

      {/* Switch to the other method, if it's already stored. Saving a method never
          erases the previous one, so this usually works without re-entering details. */}
      {other && (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSwitch}
            disabled={setPayoutMethod.isPending}
          >
            {setPayoutMethod.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Use my saved ${methodLabel(other).toLowerCase()}`
            )}
          </Button>
          {switchError && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {switchError}
            </p>
          )}
        </div>
      )}

      <SavePayoutForm
        key={formMethod}
        initialMethod={formMethod}
        hasActiveMethod={active !== null}
        onSaved={() => setSwitchError(null)}
      />

      {profile.payout_set && <RemovePayoutSection />}
    </div>
  );
}

// Entry form for adding or replacing a method. Mounted with `key={initialMethod}` by
// the parent so a failed switch can drop it onto the method that needs details.
function SavePayoutForm({
  initialMethod,
  hasActiveMethod,
  onSaved,
}: {
  initialMethod: PayoutMethodKind;
  hasActiveMethod: boolean;
  onSaved: () => void;
}) {
  const updatePayout = useUpdatePayout();
  const form = usePayoutMethodForm(initialMethod);

  const handleSave = async () => {
    const payload = form.buildPayload();
    if (!payload) return; // form.error now holds the message
    try {
      const saved = await updatePayout.mutateAsync(payload);
      form.reset();
      onSaved();
      // Saving activates the method immediately — there is no confirm step — so the
      // toast says it landed, not that it was merely stored.
      toast.success(`Payouts now go to ${destinationLabel(saved, form.method)}`);
    } catch (err) {
      form.setError(
        err instanceof Error ? err.message : "Couldn’t save your payout details. Try again.",
      );
    }
  };

  const saving = updatePayout.isPending;

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {hasActiveMethod ? "Change payout method" : "Add a payout method"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Saving makes this your active method straight away. Your other saved method, if any, is
          kept so you can switch back.
        </p>
      </div>

      <PayoutMethodFields form={form} disabled={saving} idPrefix="edit-payout" />

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save payout method"}
      </Button>
    </div>
  );
}

// Removal is the only path that deletes payout details, and it clears *both* methods
// — not just the active one — so it gets an explicit confirmation that says so.
function RemovePayoutSection() {
  const removePayout = useRemovePayoutMethod();
  const [open, setOpen] = useState(false);
  const busy = removePayout.isPending;

  const handleRemove = async () => {
    try {
      await removePayout.mutateAsync();
      setOpen(false);
      toast.success("Payout details removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t remove your payout details.");
    }
  };

  return (
    <div className="border-t border-border pt-6">
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <Button
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove payout details
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove payout details?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes both your UPI ID and your bank account, not just the active one. We won’t
              be able to pay you until you add a payout method again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                // AlertDialogAction closes the dialog by default; prevent that so it
                // stays open (and disabled) while the request is in flight.
                e.preventDefault();
                void handleRemove();
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
