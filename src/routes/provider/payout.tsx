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
import type { Translate } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/provider/payout")({
  component: ProviderPayoutPage,
});

const methodLabel = (m: PayoutMethodKind, t: Translate) =>
  m === "upi" ? t("payout.upi") : t("payout.bank");

// Names the destination a write landed on, for the confirmation toast. Prefers the
// server's label — "••••7890", or the VPA in full — because naming the actual account
// is what lets a provider catch a wrong switch straight away. Falls back to the method
// name when the label is null, which it is for providers whose method predates SVC-148
// (the migration declined to decrypt every provider's PII just to backfill a label).
//
// "your upi id" / "your bank account" in English: the lower-cased method name
// it always was, now a key because Hindi and Marathi have no case to lower.
const destinationLabel = (profile: ProviderProfile, fallback: PayoutMethodKind, t: Translate) =>
  profile.payout_display ??
  ((profile.payout_method ?? fallback) === "upi" ? t("payout.yourUpi") : t("payout.yourBank"));

// SVC-148 — manage the payout method after onboarding: see what's on file, switch
// between UPI and bank, replace either, or remove payout details entirely.
function ProviderPayoutPage() {
  const { data: profile, isLoading, isError, error } = useProviderProfile();
  const { t, lang } = useT("provider");

  return (
    <div className="min-h-screen p-6">
      <Link
        to="/provider/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("payout.back")}
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-foreground">{t("payout.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("payout.intro")}</p>

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {isError && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {errorText(error, t("payout.loadFailed"), lang)}
        </p>
      )}

      {profile && <PayoutManager profile={profile} />}
    </div>
  );
}

function PayoutManager({ profile }: { profile: ProviderProfile }) {
  const setPayoutMethod = useSetPayoutMethod();
  const { t, lang } = useT("provider");

  const active = profile.payout_method;
  // The method that isn't active.
  const other: PayoutMethodKind | null =
    active === "upi" ? "bank" : active === "bank" ? "upi" : null;

  // Only offer the switch when the other method actually has details on file, so the
  // button is never a dead end (SVC-152). Against a backend that predates that field
  // we fall back to offering it — the old optimistic behaviour, where the 400 below
  // is what reveals the truth.
  const canSwitch = other !== null && (profile.payout_methods_stored?.includes(other) ?? true);

  const [switchError, setSwitchError] = useState<string | null>(null);
  // Which method the entry form starts on. Keyed into the form below so that
  // changing it remounts with a clean slate.
  const [formMethod, setFormMethod] = useState<PayoutMethodKind>(active ?? "upi");

  const handleSwitch = async () => {
    if (!other) return;
    setSwitchError(null);
    try {
      const switched = await setPayoutMethod.mutateAsync(other);
      toast.success(t("payout.nowGoesTo", { destination: destinationLabel(switched, other, t) }));
    } catch (err) {
      const message = errorText(err, t("payout.switchFailed"), lang);
      setSwitchError(message);
      // 400 means nothing is stored for that method. Since SVC-152 the button is only
      // shown when it is, so this is now a staleness guard rather than the way we find
      // out — the cached profile can lag a removal made in another session. Kept
      // because that race would otherwise surface as an unexplained failure, and it
      // still does the useful thing: drop the form onto the method needing details.
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
              <p className="text-sm text-muted-foreground">{methodLabel(active, t)}</p>
              {/* payout_display is null for providers whose method predates SVC-148 —
                  the backfill set the method but deliberately left the label empty
                  rather than guess it, so this must not render blank. */}
              <p className="truncate font-medium text-foreground">
                {profile.payout_display ??
                  (active === "upi" ? t("payout.onFileUpi") : t("payout.onFileBank"))}
              </p>
            </div>
            <Badge>{t("payout.active")}</Badge>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4">
          <WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium text-foreground">{t("payout.noneTitle")}</p>
            <p className="text-muted-foreground">{t("payout.noneDetail")}</p>
          </div>
        </div>
      )}

      {/* Switch to the other method. Saving a method never erases the previous one,
          so this works without re-entering details. */}
      {other && canSwitch && (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSwitch}
            disabled={setPayoutMethod.isPending}
          >
            {setPayoutMethod.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : other === "upi" ? (
              t("payout.useSavedUpi")
            ) : (
              t("payout.useSavedBank")
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
  const { t, lang } = useT("provider");
  const form = usePayoutMethodForm(initialMethod, t);

  const handleSave = async () => {
    const payload = form.buildPayload();
    if (!payload) return; // form.error now holds the message
    try {
      const saved = await updatePayout.mutateAsync(payload);
      form.reset();
      onSaved();
      // Saving activates the method immediately — there is no confirm step — so the
      // toast says it landed, not that it was merely stored.
      toast.success(
        t("payout.nowGoesTo", { destination: destinationLabel(saved, form.method, t) }),
      );
    } catch (err) {
      form.setError(errorText(err, t("payout.saveFailed"), lang));
    }
  };

  const saving = updatePayout.isPending;

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {hasActiveMethod ? t("payout.changeTitle") : t("payout.addTitle")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("payout.saveHint")}</p>
      </div>

      <PayoutMethodFields form={form} disabled={saving} idPrefix="edit-payout" />

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("payout.save")}
      </Button>
    </div>
  );
}

// Removal is the only path that deletes payout details, and it clears *both* methods
// — not just the active one — so it gets an explicit confirmation that says so.
function RemovePayoutSection() {
  const removePayout = useRemovePayoutMethod();
  const { t, lang } = useT("provider");
  const [open, setOpen] = useState(false);
  const busy = removePayout.isPending;

  const handleRemove = async () => {
    try {
      await removePayout.mutateAsync();
      setOpen(false);
      toast.success(t("payout.removed"));
    } catch (err) {
      toast.error(errorText(err, t("payout.removeFailed"), lang));
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
          {t("payout.remove")}
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("payout.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("payout.removeBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("payout.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                // AlertDialogAction closes the dialog by default; prevent that so it
                // stays open (and disabled) while the request is in flight.
                e.preventDefault();
                void handleRemove();
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("payout.removeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
