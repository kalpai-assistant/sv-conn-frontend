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

export function proKycCopy(me: Pick<ProMe, "kyc_status" | "kyc_rejection_reason">): {
  title: string;
  detail: string;
} | null {
  switch (me.kyc_status) {
    case "verified":
      return null;
    case "submitted":
      return {
        title: "Your identity is being checked",
        detail: "This usually takes a day. You can take jobs once it's approved.",
      };
    case "rejected":
      return {
        title: "Your identity check didn't go through",
        detail: me.kyc_rejection_reason
          ? `Reason: ${me.kyc_rejection_reason.trim().replace(/\.$/, "")}. Please submit your documents again.`
          : "Please submit your documents again.",
      };
    default:
      return {
        title: "Verify your identity to get jobs",
        detail: "Your team can't give you a job until your Aadhaar is verified.",
      };
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
export function proOnlineSwitch({
  isOnline,
  isVerified,
}: {
  isOnline: boolean;
  isVerified: boolean;
}): { canToggle: boolean; detail: string } {
  if (isVerified) {
    return { canToggle: true, detail: "Your team can only give you jobs while this is on." };
  }
  if (isOnline) {
    return {
      canToggle: true,
      detail: "Your team can't give you jobs until your identity is verified.",
    };
  }
  return { canToggle: false, detail: "You can go online once your identity is verified." };
}
