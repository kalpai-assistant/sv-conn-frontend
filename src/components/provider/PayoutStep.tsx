import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdatePayout } from "@/hooks/useApi";
import { usePayoutMethodForm } from "@/hooks/usePayoutMethodForm";
import { PayoutMethodFields } from "@/components/provider/PayoutMethodFields";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";

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
  const { t, lang } = useT("provider");
  const form = usePayoutMethodForm(undefined, t);

  const handleContinue = async () => {
    const payload = form.buildPayload();
    if (!payload) return; // form.error now holds the message
    try {
      await updatePayout.mutateAsync(payload);
      onDone();
    } catch (err) {
      form.setError(errorText(err, t("payout.saveFailed"), lang));
    }
  };

  const saving = updatePayout.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("payoutStep.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("payoutStep.intro")}</p>
      </div>

      {alreadySet && (
        <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
          {t("payoutStep.alreadySet")}
        </p>
      )}

      <PayoutMethodFields form={form} disabled={saving} idPrefix="onboarding-payout" />

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={saving}>
          {t("payoutStep.back")}
        </Button>
        <Button className="flex-1" onClick={handleContinue} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("payoutStep.save")}
        </Button>
      </div>
      <Button variant="ghost" className="w-full" onClick={onDone} disabled={saving}>
        {t("payoutStep.skip")}
      </Button>
    </div>
  );
}
