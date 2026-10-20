/**
 * What the Pro app says about a Pro's identity KYC (SVC-322, SVC-327).
 *
 * A team Pro cannot be given a job until this is verified — the SP's `/assign`
 * answers PRO_KYC_INCOMPLETE (backend #196) — so an unverified Pro gets no work
 * and nothing else on screen says why. This is that explanation.
 *
 * "pending" and "rejected" need something from the Pro, "submitted" needs
 * something from us, so they are three messages rather than one "not
 * verified". Returns null once verified: there is nothing to say.
 */
import type { ProMe } from "@/hooks/usePro";
import { englishT, type Translate } from "@/i18n";

export function proKycCopy(
  me: Pick<ProMe, "kyc_status" | "kyc_rejection_reason">,
  t: Translate = englishT("pro"),
): {
  title: string;
  detail: string;
} | null {
  switch (me.kyc_status) {
    case "verified":
      return null;
    case "submitted":
      return { title: t("kycStatus.submittedTitle"), detail: t("kycStatus.submittedDetail") };
    case "rejected":
      return {
        title: t("kycStatus.rejectedTitle"),
        // The reason is the reviewer's own words, in English; it is quoted,
        // not translated.
        detail: me.kyc_rejection_reason
          ? t("kycStatus.rejectedWithReason", {
              reason: me.kyc_rejection_reason.trim().replace(/\.$/, ""),
            })
          : t("kycStatus.rejectedNoReason"),
      };
    default:
      return { title: t("kycStatus.pendingTitle"), detail: t("kycStatus.pendingDetail") };
  }
}

/**
 * The online switch for a Pro, given their KYC (SVC-322).
 *
 * Going *on* waits for "verified": the SP cannot give an unverified Pro a job
 * (`/assign` answers PRO_KYC_INCOMPLETE), so an enabled switch would promise
 * work that cannot come. Going *off* is always allowed. The backend lets a
 * team Pro be online whatever their KYC, and one whose KYC is rejected later
 * stays online — found on device, the switch then sat at "You're online",
 * greyed out, with no way to turn it off.
 */
export function proOnlineSwitch(
  {
    isOnline,
    isVerified,
  }: {
    isOnline: boolean;
    isVerified: boolean;
  },
  t: Translate = englishT("pro"),
): { canToggle: boolean; detail: string } {
  if (isVerified) return { canToggle: true, detail: t("onlineSwitch.verified") };
  if (isOnline) return { canToggle: true, detail: t("onlineSwitch.unverifiedOnline") };
  return { canToggle: false, detail: t("onlineSwitch.unverifiedOffline") };
}
