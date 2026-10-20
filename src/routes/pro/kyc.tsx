import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CameraCapture } from "@/components/CameraCapture";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useProMe, useSubmitProKyc } from "@/hooks/usePro";
import { useT } from "@/i18n/LanguageProvider";
import { errorText } from "@/i18n/errors";

export const Route = createFileRoute("/pro/kyc")({
  component: ProKycPage,
});

// SVC-322 — the Pro's own identity KYC (SVC-327): Aadhaar front, back and a
// live selfie, the same three photos an SP takes, through `POST /pros/me/kyc`.
//
// Identity only. A team Pro has no payout KYC — no bank, no UPI — because their
// pay goes to their SP, so this screen has nothing else to ask. Until it is
// verified, the SP cannot assign them a job (`/assign` → PRO_KYC_INCOMPLETE).
function ProKycPage() {
  const { user } = useAuth();
  const { data: me } = useProMe(user?.id);
  const submitKyc = useSubmitProKyc();
  const navigate = useNavigate();
  const [aadhaarFront, setAadhaarFront] = useState<Blob | null>(null);
  const [aadhaarBack, setAadhaarBack] = useState<Blob | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const { t, lang } = useT("pro");
  const { t: tc } = useT();

  const ready = !!aadhaarFront && !!aadhaarBack && !!selfie;

  const submit = async () => {
    if (!aadhaarFront || !aadhaarBack || !selfie) return;
    try {
      await submitKyc.mutateAsync({ aadhaarFront, aadhaarBack, selfie });
      toast.success(t("kyc.sent"));
      navigate({ to: "/pro", replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.code === "SELF_PRO_KYC_IS_SP_KYC"
          ? tc("errors.SELF_PRO_KYC_IS_SP_KYC")
          : errorText(err, t("kyc.sendFailed"), lang),
      );
    }
  };

  return (
    <div className="min-h-screen p-6 pb-24">
      <Link
        to="/pro"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("kyc.back")}
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-foreground">{t("kyc.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("kyc.intro")}</p>

      {me?.kyc_status === "rejected" && me.kyc_rejection_reason && (
        <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {t("kyc.lastTime", { reason: me.kyc_rejection_reason })}
        </p>
      )}

      <div className="mt-5 space-y-5">
        <div className="space-y-2">
          <Label>{t("kyc.aadhaarFront")}</Label>
          <CameraCapture
            label={t("kyc.captureFront")}
            file={aadhaarFront}
            onCapture={setAadhaarFront}
            direction="rear"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("kyc.aadhaarBack")}</Label>
          <CameraCapture
            label={t("kyc.captureBack")}
            file={aadhaarBack}
            onCapture={setAadhaarBack}
            direction="rear"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("kyc.selfie")}</Label>
          <CameraCapture
            label={t("kyc.captureSelfie")}
            file={selfie}
            onCapture={setSelfie}
            direction="front"
          />
        </div>

        <Button className="w-full" disabled={!ready || submitKyc.isPending} onClick={submit}>
          {submitKyc.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("kyc.submit")}
        </Button>
      </div>
    </div>
  );
}
