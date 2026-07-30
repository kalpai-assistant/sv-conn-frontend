import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdatePayout } from "@/hooks/useApi";
import { usePayoutMethodForm } from "@/hooks/usePayoutMethodForm";
import { PayoutMethodFields } from "@/components/provider/PayoutMethodFields";

// SVC-133 — the "How should we pay you?" onboarding step. Collects a UPI VPA or
// bank account + IFSC, validates client-side (mirroring the backend so we don't
// hit a 422), and saves via PATCH /providers/me. Skippable during onboarding.
//
// The fields and validation are shared with the SVC-148 edit screen; only the
// step framing and the Back / Skip buttons are specific to onboarding.
export function PayoutStep({
  alreadySet,
  onBack,
  onDone,
}: {
  alreadySet: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const updatePayout = useUpdatePayout();
  const form = usePayoutMethodForm();

  const handleContinue = async () => {
    const payload = form.buildPayload();
    if (!payload) return; // form.error now holds the message
    try {
      await updatePayout.mutateAsync(payload);
      onDone();
    } catch (err) {
      form.setError(
        err instanceof Error ? err.message : "Couldn’t save your payout details. Try again.",
      );
    }
  };

  const saving = updatePayout.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">How should we pay you?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a UPI ID or bank account so we can send your earnings. You can skip this and add it
          later.
        </p>
      </div>

      {alreadySet && (
        <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
          A payout method is already on file. Enter a new one to replace it, or skip.
        </p>
      )}

      <PayoutMethodFields form={form} disabled={saving} idPrefix="onboarding-payout" />

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button className="flex-1" onClick={handleContinue} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & continue"}
        </Button>
      </div>
      <Button variant="ghost" className="w-full" onClick={onDone} disabled={saving}>
        Skip for now
      </Button>
    </div>
  );
}
